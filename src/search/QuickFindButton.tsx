import { Search } from 'lucide-react';
import { ariaShortcut, shortcutLabel } from '../ui/keys';
import { openQuickFind } from './store';

/** The top bar's search button: opens Quick find, and its tooltip teaches the shortcut. */
export function QuickFindButton() {
  return (
    <button
      type="button"
      className="bar-icon"
      aria-label="Quick find"
      aria-keyshortcuts={ariaShortcut()}
      title={`Quick find (${shortcutLabel()})`}
      data-testid="quick-find-button"
      onClick={openQuickFind}
    >
      <Search className="h-4 w-4" aria-hidden />
    </button>
  );
}
