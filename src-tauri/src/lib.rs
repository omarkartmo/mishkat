use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // Enforce educational controlled environment:
            // Intercept new window requests, restrict DevTools in production
            #[cfg(not(debug_assertions))]
            {
                // Disable right-click context menu in production
                let _ = window.eval(
                    "window.addEventListener('contextmenu', function(e) { e.preventDefault(); }, false);"
                );
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MISHKAT Student application");
}
