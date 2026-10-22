import { LayoutDashboard } from 'lucide-react';
import { useMemo } from 'react';
import { PAGE_ICONS } from '../dashboard/icons';
import { useDashboard } from '../dashboard/store';
import { useQuickFindCommands, type QuickFindCommand } from './store';

/**
 * Offers the dashboard's pages in Quick find (and the Search widget): picking one switches to
 * it, and brings the dashboard back if Settings is showing. Called by <QuickFind>, so the search
 * entries themselves never import the dashboard store (which imports the widget registry).
 */
export function usePageCommands(onShowDashboard: () => void) {
  const pages = useDashboard((s) => s.pages);
  const activePageId = useDashboard((s) => s.activePageId);
  const commands = useMemo<QuickFindCommand[]>(
    () =>
      pages.map((p) => ({
        id: p.id,
        group: 'pages',
        title: p.name,
        keywords: ['Dashboard'],
        detail: p.id === activePageId ? 'Current page' : 'Switch to this page',
        icon: PAGE_ICONS[p.icon] ?? LayoutDashboard,
        run: () => {
          useDashboard.getState().setActivePage(p.id);
          onShowDashboard();
        },
      })),
    [pages, activePageId, onShowDashboard],
  );
  useQuickFindCommands('pages', commands);
}
