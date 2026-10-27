use std::net::{TcpListener, TcpStream, SocketAddr};
use std::time::Duration;
use std::thread;
use std::sync::{Arc, Mutex, mpsc};
use std::io::{Write, Read};
use std::process::Command;
use std::path::PathBuf;
use winreg::enums::*;
use winreg::RegKey;

const DEFAULT_BLOCKLIST_PAC: &str = r#"function FindProxyForURL(url, host) {
  // 1. Always allow local network, loopback, and school intranet
  if (shExpMatch(host, "127.0.0.1") || shExpMatch(host, "localhost") || isPlainHostName(host) || shExpMatch(host, "*.local")) {
    return "DIRECT";
  }
  if (shExpMatch(host, "10.*") || shExpMatch(host, "192.168.*") || shExpMatch(host, "172.1[6-9].*") || shExpMatch(host, "172.2[0-9].*") || shExpMatch(host, "172.3[0-1].*")) {
    return "DIRECT";
  }

  // 2. Persistent Offline Blocklist: Educational & Distraction Protection
  if (
    host === "youtube.com" || dnsDomainIs(host, ".youtube.com") || shExpMatch(host, "*youtube*") ||
    host === "youtu.be" || dnsDomainIs(host, ".youtu.be") ||
    shExpMatch(host, "*googlevideo.com*") || shExpMatch(host, "*ytimg.com*") ||
    host === "tiktok.com" || dnsDomainIs(host, ".tiktok.com") || shExpMatch(host, "*tiktok*") ||
    host === "facebook.com" || dnsDomainIs(host, ".facebook.com") || shExpMatch(host, "*facebook*") ||
    host === "instagram.com" || dnsDomainIs(host, ".instagram.com") || shExpMatch(host, "*instagram*") ||
    host === "twitter.com" || dnsDomainIs(host, ".twitter.com") ||
    host === "x.com" || dnsDomainIs(host, ".x.com") ||
    shExpMatch(host, "*netflix*") || shExpMatch(host, "*roblox*") || shExpMatch(host, "*twitch.tv*")
  ) {
    return "PROXY 127.0.0.1:9999";
  }

  return "DIRECT";
}
"#;

fn get_local_pac_file_path() -> PathBuf {
    let base_dir = std::env::var("LOCALAPPDATA")
        .unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let mut p = PathBuf::from(base_dir);
    p.push("Mishkat");
    let _ = std::fs::create_dir_all(&p);
    p.push("proxy.pac");
    p
}

fn load_initial_pac() -> String {
    let p = get_local_pac_file_path();
    if let Ok(content) = std::fs::read_to_string(&p) {
        if content.contains("FindProxyForURL") {
            return content;
        }
    }
    let _ = std::fs::write(&p, DEFAULT_BLOCKLIST_PAC);
    DEFAULT_BLOCKLIST_PAC.to_string()
}

fn start_local_pac_loopback(pac_content: Arc<Mutex<String>>) {
    thread::spawn(move || {
        if let Ok(listener) = TcpListener::bind("127.0.0.1:4005") {
            for stream in listener.incoming() {
                if let Ok(mut stream) = stream {
                    let mut buf = [0u8; 1024];
                    let _ = stream.read(&mut buf);
                    let body = match pac_content.lock() {
                        Ok(guard) => guard.clone(),
                        Err(poisoned) => poisoned.into_inner().clone(),
                    };
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/x-ns-proxy-autoconfig\r\nCache-Control: no-cache, no-store, must-revalidate\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                }
            }
        }
    });
}

fn start_blackhole_proxy() {
    thread::spawn(move || {
        if let Ok(listener) = TcpListener::bind("127.0.0.1:9999") {
            for stream in listener.incoming() {
                if let Ok(mut stream) = stream {
                    let mut buf = [0u8; 1024];
                    let _ = stream.read(&mut buf);
                    let body = "<!DOCTYPE html><html dir='rtl' lang='ar'><head><meta charset='utf-8'><title>محجوب</title></head><body style='font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'><div style='text-align:center;padding:2rem;background:#1e293b;border-radius:1rem;border:1px solid #334155;'><h1>🛡️ تم حظر الوصول إلى هذا الموقع</h1><p style='color:#94a3b8;'>وفقاً لسياسة استخدام الإنترنت المعتمدة في مكتبة مشكاة.</p></div></body></html>";
                    let response = format!(
                        "HTTP/1.1 403 Forbidden\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nCache-Control: no-cache, no-store, must-revalidate\r\nContent-Length: {}\r\n\r\n{}",
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                }
            }
        }
    });
}

fn register_startup() {
    if let Ok(exe_path) = std::env::current_exe() {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(run_key) = hkcu.open_subkey_with_flags(
            r#"Software\Microsoft\Windows\CurrentVersion\Run"#,
            KEY_SET_VALUE,
        ) {
            let _ = run_key.set_value("MishkatStudentShield", &exe_path.to_string_lossy().to_string());
        }
    }
}

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

                New-Item -Path 'HKLM:\SOFTWARE\Policies\Google\Chrome' -Force -ErrorAction SilentlyContinue | Out-Null
                Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Google\Chrome' -Name 'QuicAllowed' -Value 0 -Type DWord -ErrorAction SilentlyContinue
                New-Item -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' -Force -ErrorAction SilentlyContinue | Out-Null
                Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' -Name 'QuicAllowed' -Value 0 -Type DWord -ErrorAction SilentlyContinue
            } catch {}
            $connPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings\Connections'
            foreach ($valName in @('DefaultConnectionSettings', 'SavedLegacySettings')) {
                $prop = Get-ItemProperty -Path $connPath -Name $valName -ErrorAction SilentlyContinue
                if ($prop -and $prop.$valName -and $prop.$valName.Length -ge 9) {
                    $bytes = [byte[]]$prop.$valName
                    $bytes[8] = [byte]($bytes[8] -bor 0x04)
                    Set-ItemProperty -Path $connPath -Name $valName -Value $bytes -Force -ErrorAction SilentlyContinue
                }
            }

            ipconfig /flushdns | Out-Null
            $signature = @'
            [DllImport("wininet.dll", SetLastError = true, CharSet=CharSet.Auto)]
            public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
'@
            $wininet = Add-Type -MemberDefinition $signature -Name "WinINet" -Namespace "Win32" -PassThru -ErrorAction SilentlyContinue
            if ($wininet) {
                $wininet::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
                $wininet::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)
                $wininet::InternetSetOption([IntPtr]::Zero, 42, [IntPtr]::Zero, 0)
            }
        "#;
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", refresh_script])
            .output();
    }
}

fn fetch_remote_pac(ip: &str) -> Option<String> {
    let addr = format!("{}:3000", ip);
    if let Ok(addr) = addr.parse::<SocketAddr>() {
        if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(2000)) {
            let req = format!("GET /api/v1/internet-policy/proxy.pac HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n", ip);
            if stream.write_all(req.as_bytes()).is_ok() {
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok() {
                    if let Some(pos) = response.find("\r\n\r\n") {
                        let body = response[pos + 4..].to_string();
                        if body.contains("FindProxyForURL") {
                            return Some(body);
                        }
                    }
                }
            }
        }
    }
    None
}

pub fn run() {
    // 1. Register in Windows startup so student protection is active on every boot
    if cfg!(target_os = "windows") {
        register_startup();
    }

    // 2. Start local PAC loopback server (127.0.0.1:4005) & local blackhole proxy (127.0.0.1:9999)
    let initial_pac = load_initial_pac();
    let pac_state = Arc::new(Mutex::new(initial_pac));
    start_local_pac_loopback(Arc::clone(&pac_state));
    start_blackhole_proxy();

    // 3. Immediately enforce local loopback PAC so student PC is protected even if server is offline
    if cfg!(target_os = "windows") {
        set_system_proxy("http://127.0.0.1:4005/proxy.pac");
    }

    // 4. Scan network for Central Server and synchronize live policy
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
        
        match rx.recv_timeout(Duration::from_secs(3)) {
            Ok(ip) => {
                let url = format!("http://{}:3000/student", ip);
                
                // Fetch live dynamic PAC from central server
                if let Some(live_pac) = fetch_remote_pac(&ip) {
                    if let Ok(mut guard) = pac_state.lock() {
                        *guard = live_pac.clone();
                    }
                    let _ = std::fs::write(get_local_pac_file_path(), &live_pac);
                }

                if cfg!(target_os = "windows") {
                    set_system_proxy("http://127.0.0.1:4005/proxy.pac");
                    
                    // Open default browser directly to the student portal
                    let _ = Command::new("cmd")
                        .args(["/C", "start", &url])
                        .spawn();
                }

                // Background sync worker: periodically fetch latest policy updates from server
                let bg_pac_state = Arc::clone(&pac_state);
                let bg_ip = ip.clone();
                thread::spawn(move || {
                    loop {
                        thread::sleep(Duration::from_secs(20));
                        if let Some(updated_pac) = fetch_remote_pac(&bg_ip) {
                            let mut changed = false;
                            if let Ok(mut guard) = bg_pac_state.lock() {
                                if *guard != updated_pac {
                                    *guard = updated_pac.clone();
                                    changed = true;
                                }
                            }
                            if changed {
                                let _ = std::fs::write(get_local_pac_file_path(), &updated_pac);
                                if cfg!(target_os = "windows") {
                                    set_system_proxy("http://127.0.0.1:4005/proxy.pac");
                                }
                            }
                        }
                    }
                });

                break;
            },
            Err(_) => {
                // Central server is OFFLINE: Student PC remains fully protected via 127.0.0.1:4005!
                if !show_error_msg_and_retry() {
                    break;
                }
            }
        }
    }
}
