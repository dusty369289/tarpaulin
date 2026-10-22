import { useEffect, useRef, useState } from 'react';

// What every modal dialog does (Modal, Drawer, ConfirmDialog): focus moves in when it opens, Tab
// and Shift+Tab stay inside, Escape closes only the topmost one, and focus goes back to whatever
// opened it when it closes.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

const visible = (el: HTMLElement) =>
  typeof el.checkVisibility === 'function' ? el.checkVisibility() : el.getClientRects().length > 0;

/** The elements Tab can reach inside `root`, in order. Roving radios (tabindex -1) don't count. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.tabIndex >= 0 && !el.closest('[inert]') && visible(el),
  );
}

/** Open dialogs, oldest first. Only the last one answers Tab and Escape. */
const stack: object[] = [];

/**
 * Wires a dialog panel up as a modal: attach the returned ref to the panel, which needs
 * `tabIndex={-1}`. On open, focus goes to an element marked `data-autofocus`, else to the panel
 * itself (so screen readers announce the dialog's name). A child's `autoFocus` wins over both.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Read during the first render, before any child's autoFocus moves focus.
  const [opener] = useState(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const me = {};
    stack.push(me);
    const isTop = () => stack[stack.length - 1] === me;

    if (!panel.contains(document.activeElement)) {
      const target = panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel;
      target.focus({ preventScroll: true });
    }

    // On window, so a menu or search box inside the dialog that handles Escape itself (and stops
    // it) gets it first.
    const onKey = (e: KeyboardEvent) => {
      if (!isTop() || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      } else if (e.key === 'Tab') {
        const items = tabbables(panel);
        if (!items.length) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const at = document.activeElement;
        const inside = panel.contains(at);
        if (e.shiftKey && (!inside || at === first || at === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (!inside || at === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    // Focus that lands outside the top dialog some other way (a click on a window edge, a
    // script) comes back in.
    const onFocusIn = (e: FocusEvent) => {
      if (isTop() && e.target instanceof Node && !panel.contains(e.target))
        panel.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      stack.splice(stack.indexOf(me), 1);
      const at = document.activeElement;
      const lost = !at || at === document.body || panel.contains(at);
      if (lost && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  return ref;
}
