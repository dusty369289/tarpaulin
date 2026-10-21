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
            "open_web_link",
            "app_version",
            "check_update",
            "install_update",
        ]),
    ))
    .expect("failed to run tauri-build");
}
