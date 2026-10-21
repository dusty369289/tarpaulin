fn main() {
    // Register every app command so capabilities/default.json can allow exactly these and nothing else.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "canvas_request",
            "auth_status",
            "save_token",
            "oauth_login",
            "logout",
            "open_external",
            "app_version",
            "check_update",
            "install_update",
            "notification_permission",
            "request_notification_permission",
            "notify",
            "autostart_enabled",
            "set_autostart",
            "launched_at_login",
            "minimize_window",
        ]),
    ))
    .expect("failed to run tauri-build");
}
