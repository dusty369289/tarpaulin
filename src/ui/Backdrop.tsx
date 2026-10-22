import type { MouseEvent, ReactNode } from 'react';

// The dimmed layer behind a modal dialog. It is a mouse convenience only (a press on it closes,
// like Escape), so it is role="presentation": nothing for assistive tech to announce or operate.
// It can't be aria-hidden, since the dialog sits inside it. Only a press on the backdrop itself
// counts, not one that bubbles up from the panel.

const PLACEMENT = {
  /** A dialog in the middle of the window. */
  center: 'z-50 items-center justify-center bg-black/40 p-4',
  /** A palette near the top (Quick find). */
  top: 'z-50 items-start justify-center bg-black/40 p-4 pt-[12vh]',
  /** A drawer along the right edge. */
  end: 'z-40 justify-end bg-black/20',
};

export function Backdrop({
  onClose,
  align = 'center',
  children,
}: {
  onClose: () => void;
  align?: keyof typeof PLACEMENT;
  children: ReactNode;
}) {
  const onMouseDown = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };
  return (
    <div
      className={`fixed inset-0 flex animate-fade-in ${PLACEMENT[align]}`}
      role="presentation"
      onMouseDown={onMouseDown}
    >
      {children}
    </div>
  );
}
