use std::net::{TcpStream, SocketAddr};
use std::time::Duration;
use std::thread;
use std::sync::mpsc;
use std::io::{Write, Read};
use std::process::Command;
use winreg::enums::*;
use winreg::RegKey;

fn get_local_ipv4_bases() -> Vec<String> {
    let mut bases = Vec::new();
    if let Ok(output) = Command::new("ipconfig").output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains("IPv4 Address") || line.contains("IPv4") {
                if let Some(ip) = line.split(':').last() {
                    let ip = ip.trim();
                    let parts: Vec<&str> = ip.split('.').collect();
                    if parts.len() == 4 {
                        bases.push(format!("{}.{}.{}.", parts[0], parts[1], parts[2]));
                    }
                }
            }
        }
    }
    bases
}

fn show_error_msg_and_retry() -> bool {
    let script = r#"
        Add-Type -AssemblyName System.Windows.Forms
        $result = [System.Windows.Forms.MessageBox]::Show('تعذر الاتصال بخادم Mishkat.

تأكد من:
- تشغيل حاسوب الخادم.
- اتصال الجهاز بالشبكة المحلية.

هل تريد إعادة المحاولة؟', 'Mishkat Student', 'RetryCancel', 'Error')
        if ($result -eq 'Retry') { exit 0 } else { exit 1 }
    "#;
    
    if let Ok(mut child) = Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .spawn() {
            if let Ok(status) = child.wait() {
                return status.success();
            }
        }
    false
}

fn set_system_proxy(pac_url: &str) {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(internet_settings) = hkcu.open_subkey_with_flags(
        r#"Software\Microsoft\Windows\CurrentVersion\Internet Settings"#,
        KEY_ALL_ACCESS,
    ) {
        // Enable AutoConfigURL (PAC file)
        let _ = internet_settings.set_value("AutoConfigURL", &pac_url.to_string());
        
        // Ensure proxy is enabled conceptually, though AutoConfigURL overrides standard proxy
        let _ = internet_settings.set_value("ProxyEnable", &0u32); 

        // Refresh system settings & enforce QUIC blocking
        let refresh_script = r#"
            try {
                netsh advfirewall firewall add rule name="MISHKAT Block QUIC (UDP 443)" dir=out action=block protocol=UDP remoteport=443 | Out-Null
            } catch {}
            try {
                New-Item -Path 'HKCU:\Software\Policies\Google\Chrome' -Force -ErrorAction SilentlyContinue | Out-Null
                Set-ItemProperty -Path 'HKCU:\Software\Policies\Google\Chrome' -Name 'QuicAllowed' -Value 0 -Type DWord -ErrorAction SilentlyContinue
                New-Item -Path 'HKCU:\Software\Policies\Microsoft\Edge' -Force -ErrorAction SilentlyContinue | Out-Null
                Set-ItemProperty -Path 'HKCU:\Software\Policies\Microsoft\Edge' -Name 'QuicAllowed' -Value 0 -Type DWord -ErrorAction SilentlyContinue
            } catch {}
            $signature = @'
            [DllImport("wininet.dll", SetLastError = true, CharSet=CharSet.Auto)]
            public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
'@
            $wininet = Add-Type -MemberDefinition $signature -Name "WinINet" -Namespace "Win32" -PassThru
            $wininet::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
            $wininet::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)
        "#;
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", refresh_script])
            .output();
    }
}

pub fn run() {
    loop {
        let bases = get_local_ipv4_bases();
        let mut all_ips = vec!["127.0.0.1".to_string()];
        
        for base in bases {
            for i in 1..=254 {
                all_ips.push(format!("{}{}", base, i));
            }
        }
        
        let (tx, rx) = mpsc::channel();
        
        for ip in all_ips {
            let tx = tx.clone();
            thread::spawn(move || {
                let addr = format!("{}:3000", ip);
                if let Ok(addr) = addr.parse::<SocketAddr>() {
                    if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(1500)) {
                        if stream.write_all(b"GET /api/v1/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").is_ok() {
                            let mut response = String::new();
                            if stream.read_to_string(&mut response).is_ok() {
                                if response.contains("200 OK") || response.contains("status") {
                                    let _ = tx.send(ip);
                                }
                            }
                        }
                    }
                }
            });
        }
        
        match rx.recv_timeout(Duration::from_secs(2)) {
            Ok(ip) => {
                let url = format!("http://{}:3000/student", ip);
                let pac_url = format!("http://{}:3000/api/v1/internet-policy/proxy.pac", ip);
                
                if cfg!(target_os = "windows") {
                    // 1. Set System Proxy to enforce Internet Policy
                    set_system_proxy(&pac_url);
                    
                    // 2. Open default browser directly to the student portal
                    let _ = Command::new("cmd")
                        .args(["/C", "start", &url])
                        .spawn();
                }
                break;
            },
            Err(_) => {
                if !show_error_msg_and_retry() {
                    break;
                }
            }
        }
    }
}
