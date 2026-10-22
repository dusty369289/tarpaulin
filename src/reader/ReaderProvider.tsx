import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSettings } from '../app/settingsStore';
import { useCanvas } from '../canvas/CanvasProvider';
import { ItemReader, preloadReaderContent } from './ItemReader';
import type { ReaderItem } from './items';

const ReaderContext = createContext<((item: ReaderItem) => void) | null>(null);

/** Holds the one open reader drawer for the whole app. */
export function ReaderProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ReaderItem | null>(null);
  const close = useCallback(() => setItem(null), []);
  // Fetch the content renderer a little after start, so the first item opens without a wait.
  useEffect(() => {
    const t = setTimeout(preloadReaderContent, 2_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <ReaderContext.Provider value={setItem}>
      {children}
      {item && <ItemReader key={`${item.kind}:${item.id}`} item={item} onClose={close} />}
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
