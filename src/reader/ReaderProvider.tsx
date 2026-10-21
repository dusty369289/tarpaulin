import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSettings } from '../app/settingsStore';
import { useCanvas } from '../canvas/CanvasProvider';
import type { ReaderItem } from './items';

// The reader, its HTML sanitiser (DOMPurify) and its styles are a separate chunk, so the
// dashboard starts without them. It is fetched a couple of seconds after start, so the first item
// still opens at once.
let loading: Promise<typeof import('./ItemReader')> | null = null;
const loadReader = () => (loading ??= import('./ItemReader'));
const ItemReader = lazy(() => loadReader().then((m) => ({ default: m.ItemReader })));

const ReaderContext = createContext<((item: ReaderItem) => void) | null>(null);

/** Holds the one open reader drawer for the whole app. */
export function ReaderProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ReaderItem | null>(null);
  const close = useCallback(() => setItem(null), []);
  useEffect(() => {
    const t = setTimeout(() => void loadReader().catch(() => (loading = null)), 2_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <ReaderContext.Provider value={setItem}>
      {children}
      {item && (
        <Suspense fallback={null}>
          <ItemReader key={`${item.kind}:${item.id}`} item={item} onClose={close} />
        </Suspense>
      )}
    </ReaderContext.Provider>
  );
}

/**
 * Opens an item the way the user prefers: in Tarpaulin's reader, or in Canvas. Items the reader
 * can't show (pages, planner notes, courses) always open in Canvas.
 */
export function useOpenItem() {
  const open = useContext(ReaderContext);
  const { openLink } = useCanvas();
  const mode = useSettings((s) => s.openItemsIn);
  return useMemo(
    () => (item: ReaderItem | null, fallbackUrl?: string | null) => {
      if (item && open && mode === 'app') open(item);
      else openLink(item?.url ?? fallbackUrl);
    },
    [open, openLink, mode],
  );
}
