//! A command that's registered but not allowed only fails at runtime ("not allowed"), and an
//! allowed command that no longer exists is dead weight in the capability. This keeps the three
//! lists in step: `generate_handler!` in lib.rs, the app manifest in build.rs, and the
//! `allow-*` entries in capabilities/default.json.

use std::collections::BTreeSet;

fn read(path: &str) -> String {
    std::fs::read_to_string(format!("{}/{path}", env!("CARGO_MANIFEST_DIR")))
        .unwrap_or_else(|e| panic!("{path}: {e}"))
}

/// The text between `start` and the next `end`.
fn between<'a>(text: &'a str, start: &str, end: char) -> &'a str {
    let from = text
        .find(start)
        .unwrap_or_else(|| panic!("{start} not found"))
        + start.len();
    let len = text[from..]
        .find(end)
        .unwrap_or_else(|| panic!("no {end} after {start}"));
    &text[from..from + len]
}

fn handler_commands() -> BTreeSet<String> {
    between(&read("src/lib.rs"), "generate_handler![", ']')
        .split(',')
        .map(|item| {
            item.trim()
                .rsplit("::")
                .next()
                .unwrap_or_default()
                .to_string()
        })
        .filter(|name| !name.is_empty())
        .collect()
}

fn manifest_commands() -> BTreeSet<String> {
    between(&read("build.rs"), ".commands(&[", ']')
        .split(',')
        .map(|item| item.trim().trim_matches('"').to_string())
        .filter(|name| !name.is_empty())
        .collect()
}

fn allowed() -> BTreeSet<String> {
    let capability: serde_json::Value =
        serde_json::from_str(&read("capabilities/default.json")).unwrap();
    capability["permissions"]
        .as_array()
        .expect("permissions array")
        .iter()
        .filter_map(|p| p.as_str()?.strip_prefix("allow-"))
        .map(|kebab| kebab.replace('-', "_"))
        .collect()
}

#[test]
fn every_command_is_registered_and_allowed() {
    let handlers = handler_commands();
    assert!(
        handlers.len() > 10,
        "parsed too few commands from lib.rs: {handlers:?}"
    );
    assert_eq!(
        handlers,
        manifest_commands(),
        "lib.rs generate_handler! and build.rs commands differ"
    );
    assert_eq!(
        handlers,
        allowed(),
        "lib.rs commands and capabilities/default.json allow-* entries differ"
    );
}
