import type { LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * An app action Quick find offers ("Edit layout", "Add widget"). Screens that own an action
 * register it while they're showing, with `useQuickFindCommands`, so the palette calls exactly
 * the code their own buttons call.
 */
export interface QuickFindCommand {
  id: string;
  title: string;
  /** Other words it should be found by ("customise", "arrange"). */
  keywords?: string[];
  /** The muted line under the title. */
  detail?: string;
  icon: LucideIcon;
  run: () => void;
}

interface QuickFindState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Registered commands, by the screen that registered them. */
  commands: Record<string, QuickFindCommand[]>;
  register: (source: string, commands: QuickFindCommand[]) => void;
  unregister: (source: string) => void;
}

export const useQuickFind = create<QuickFindState>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  commands: {},
  register: (source, commands) => set((s) => ({ commands: { ...s.commands, [source]: commands } })),
  unregister: (source) =>
    set((s) => {
      const { [source]: _gone, ...rest } = s.commands;
      return { commands: rest };
    }),
}));

/** Offers `commands` in Quick find while the calling component is mounted. Memoise the list. */
export function useQuickFindCommands(source: string, commands: QuickFindCommand[]) {
  useEffect(() => {
    useQuickFind.getState().register(source, commands);
    return () => useQuickFind.getState().unregister(source);
  }, [source, commands]);
}

/** Opens Quick find (the top bar's search button). */
export const openQuickFind = () => useQuickFind.getState().setOpen(true);

/** Whether shortcuts read ⌘ rather than Ctrl. */
export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** "⌘K" or "Ctrl+K", for tooltips and hints. */
export const shortcutLabel = (key = 'K') => (isMac() ? `⌘${key}` : `Ctrl+${key}`);
