
use std::net::{TcpStream, SocketAddr};
use std::time::Duration;
use std::thread;
use std::sync::mpsc;
use std::io::{Write, Read};
use std::process::Command;

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
                let url = format!("http://{}:3000", ip);
                if cfg!(target_os = "windows") {
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
