// The one way the web view calls the app's Rust commands. The Tauri API loads on first use, so
// the browser (dev, tests) never pulls it in.

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}
