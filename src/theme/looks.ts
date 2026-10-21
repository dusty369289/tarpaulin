/** A complete look: one page background plus the widget style made for it. */
export interface Look {
  id: string;
  name: string;
  description: string;
  background: string;
  widgetStyle: string;
}

export const LOOKS: Look[] = [
  {
    id: 'plain',
    name: 'Plain',
    description: 'Clean cards that follow light or dark mode.',
    background: 'plain',
    widgetStyle: 'card',
  },
  {
    id: 'cork',
    name: 'Cork board',
    description: 'Post-it notes pinned to cork.',
    background: 'cork',
    widgetStyle: 'postit',
  },
  {
    id: 'journal',
    name: 'Bullet journal',
    description: 'Inked boxes and washi tape on dot grid.',
    background: 'dots',
    widgetStyle: 'journal',
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Lettered panels on drafting paper.',
    background: 'blueprint',
    widgetStyle: 'blueprint',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Green phosphor on a CRT.',
    background: 'crt',
    widgetStyle: 'terminal',
  },
  {
    id: 'swiss',
    name: 'Swiss poster',
    description: 'Heavy rules, big numbers, one red.',
    background: 'poster',
    widgetStyle: 'swiss',
  },
  {
    id: 'arcade',
    name: 'Arcade',
    description: '8-bit panels under a starry sky.',
    background: 'night-sky',
    widgetStyle: 'pixel',
  },
];

export function lookOf(background: string, widgetStyle: string): Look | undefined {
  return LOOKS.find((l) => l.background === background && l.widgetStyle === widgetStyle);
}
