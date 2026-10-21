import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card max-h-[85vh] w-full overflow-hidden shadow-2xl animate-pop-in ${wide ? 'max-w-3xl' : 'max-w-md'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(85vh-3.5rem)] overflow-auto p-4 scroll-thin">{children}</div>
      </div>
    </div>
  );
}

export function Drawer({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/20 animate-fade-in"
      onMouseDown={onClose}
    >
      <aside
        role="dialog"
        aria-label={title}
        className="flex h-full w-full max-w-sm flex-col border-l border-border bg-surface shadow-2xl animate-slide-in-right"
        onMouseDown={(e) => e.stopPropagation()}
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
    </div>
  );
}
