import type { ReactNode } from 'react';

/** A key cap in a shortcut hint ("Esc", "⌘"). Styled by `.kbd` in src/index.css. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={className ? `kbd ${className}` : 'kbd'}>{children}</kbd>;
}
