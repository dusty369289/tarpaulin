// Keyboard helpers: how shortcuts are written on this platform, and which key presses are a
// shortcut rather than typing.

/** Whether shortcuts read ⌘ rather than Ctrl. */
export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** "⌘" or "Ctrl": the modifier key as shortcut hints print it. */
export const modKeyLabel = () => (isMac() ? '⌘' : 'Ctrl');

/** "⌘K" or "Ctrl+K", for tooltips and hints. `join` goes between Ctrl and the key. */
export const shortcutLabel = (key = 'K', join = '+') => (isMac() ? `⌘${key}` : `Ctrl${join}${key}`);

/** "Meta+K" or "Control+K", for `aria-keyshortcuts`. */
export const ariaShortcut = (key = 'K') => (isMac() ? `Meta+${key}` : `Control+${key}`);

/** Ctrl/⌘ + `key` (lowercase), without Alt or Shift. */
export const isModShortcut = (e: KeyboardEvent, key: string) =>
  e.key.toLowerCase() === key && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;

/** Whether keys pressed in `el` are text being typed, which single-key shortcuts must leave alone. */
export function isTyping(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  return (
    el instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset', 'file'].includes(el.type)
  );
}
