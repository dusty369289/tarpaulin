import { useEffect, type RefObject } from 'react';

/**
 * Closes a menu or popover on Escape or a pointer press outside `ref`. Escape hands focus back
 * to the trigger, so keyboard users land where they started.
 */
export function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  trigger?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || trigger?.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
      trigger?.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref, onClose, trigger]);
}
