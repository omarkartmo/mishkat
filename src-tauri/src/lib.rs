
pub fn run() {
    let url = "http://localhost:3000";
    
    // Launch the default browser
    if cfg!(target_os = "windows") {
        let _ = std::process::Command::new("cmd")
            .args(["/C", "start", url])
            .spawn();
    }
}
