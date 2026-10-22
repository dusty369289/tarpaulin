//! Saving a dashboard export. A web download (`<a download>`) doesn't work in every webview:
//! WKWebView and WebKitGTK ignore it unless the app handles downloads. So the desktop app asks
//! where to save with the native dialog and writes the file itself. The web view supplies only
//! the contents and a suggested name; the path is whatever the user picks.

use std::path::{Path, PathBuf};

use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

const DEFAULT_NAME: &str = "tarpaulin-dashboard.json";
/// A dashboard export is a few kilobytes; anything near this is not one.
const MAX_BYTES: usize = 16 * 1024 * 1024;

/// A plain file name for the dialog: no directories, no characters the file systems reject.
fn suggested_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let clean: String = base
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect();
    let clean = clean.trim().trim_start_matches('.');
    if clean.is_empty() {
        DEFAULT_NAME.into()
    } else {
        clean.into()
    }
}

/// GTK's dialog doesn't add the filter's extension when the user types a bare name. A name with
/// an extension of its own is left as typed.
fn with_json_extension(path: PathBuf) -> PathBuf {
    if path.extension().is_some() {
        path
    } else {
        let mut name = path.file_name().unwrap_or_default().to_os_string();
        name.push(".json");
        path.with_file_name(name)
    }
}

fn write(path: &Path, contents: &str) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| format!("couldn't save {}: {e}", path.display()))
}

/// Asks where to save and writes `contents` there. Resolves to the saved path, or `None` when
/// the user cancels.
#[tauri::command]
pub async fn save_export(
    window: WebviewWindow,
    file_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    if contents.len() > MAX_BYTES {
        return Err("export is too large".into());
    }
    let (tx, rx) = oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Export dashboard")
        .set_file_name(suggested_name(&file_name))
        .add_filter("Tarpaulin dashboard", &["json"])
        .save_file(move |picked| {
            let _ = tx.send(picked);
        });
    let Some(picked) = rx.await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let path = with_json_extension(picked.into_path().map_err(|e| e.to_string())?);
    write(&path, &contents)?;
    Ok(Some(path.display().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suggests_a_plain_file_name() {
        assert_eq!(
            suggested_name("tarpaulin-dashboard-2026-10-22.json"),
            "tarpaulin-dashboard-2026-10-22.json"
        );
        assert_eq!(suggested_name("../../etc/passwd"), "passwd");
        assert_eq!(suggested_name("C:\\Users\\x\\a.json"), "a.json");
        assert_eq!(suggested_name("what?:*.json"), "what.json");
        assert_eq!(suggested_name(".hidden"), "hidden");
        assert_eq!(suggested_name("  "), DEFAULT_NAME);
        assert_eq!(suggested_name("dir/"), DEFAULT_NAME);
    }

    #[test]
    fn adds_the_json_extension_when_missing() {
        assert_eq!(
            with_json_extension("/tmp/a.json".into()),
            PathBuf::from("/tmp/a.json")
        );
        assert_eq!(
            with_json_extension("/tmp/a.JSON".into()),
            PathBuf::from("/tmp/a.JSON")
        );
        assert_eq!(
            with_json_extension("/tmp/a".into()),
            PathBuf::from("/tmp/a.json")
        );
        assert_eq!(
            with_json_extension("/tmp/a.txt".into()),
            PathBuf::from("/tmp/a.txt")
        );
    }

    #[test]
    fn writes_the_contents() {
        let dir = std::env::temp_dir().join(format!("tarpaulin-export-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.json");
        write(&path, "{\"pages\":[]}").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"pages\":[]}");
        assert!(write(&dir.join("missing/x.json"), "{}")
            .unwrap_err()
            .starts_with("couldn't save"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
