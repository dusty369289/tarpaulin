import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Backdrop } from '../ui/Backdrop';
import { useDialog } from '../ui/useDialog';

// Both are modal: focus moves in and stays in, Escape closes only the topmost one, and focus
// returns to the opener on close (see src/ui/useDialog.ts). A press on the backdrop closes too
// (see src/ui/Backdrop.tsx).

export function Modal({
  title,
  onClose,
  children,
  wide,
  role = 'dialog',
  describedBy,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** 'alertdialog' for a question that needs an answer before going on. */
  role?: 'dialog' | 'alertdialog';
  /** Id of the text that explains the dialog, read out with its name. */
  describedBy?: string;
}) {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <Backdrop onClose={onClose}>
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-label={title}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`card max-h-[85vh] w-full overflow-hidden shadow-2xl outline-none animate-pop-in ${wide ? 'max-w-3xl' : 'max-w-md'}`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(85vh-3.5rem)] overflow-auto p-4 scroll-thin">{children}</div>
      </div>
    </Backdrop>
  );
}

export function Drawer({
  title,
  label,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  /** Accessible name, when the visible title is only a category ("Assignment"). */
  label?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Reading width instead of a settings column. */
  wide?: boolean;
}) {
  const ref = useDialog<HTMLElement>(onClose);
  return (
    <Backdrop onClose={onClose} align="end">
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
        tabIndex={-1}
        className={`flex h-full w-full ${wide ? 'max-w-2xl' : 'max-w-sm'} flex-col border-l border-border bg-surface shadow-2xl outline-none animate-slide-in-right`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="truncate font-semibold">{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 scroll-thin">{children}</div>
        {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
      </aside>
    </Backdrop>
  );
}
