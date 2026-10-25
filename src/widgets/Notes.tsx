import { Eye, NotebookPen, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Markdown } from '../lib/markdown';
import { field } from './settings/fields';
import { defineWidget } from './types';

const schema = z.object({
  startIn: field(z.enum(['preview', 'edit']).default('preview'), {
    label: 'Open in',
    options: { preview: 'Formatted view', edit: 'Editor' },
  }),
  fontSize: field(z.enum(['small', 'medium', 'large']).default('medium'), { label: 'Text size' }),
  monospace: field(z.boolean().default(false), { label: 'Monospace editor' }),
  placeholder: field(z.string().max(80).default('Write anything… Markdown works.'), {
    label: 'Placeholder',
  }),
});

export const NotesData = z.object({ text: z.string().default('') });

const SIZES = { small: 'text-xs', medium: 'text-sm', large: 'text-base' } as const;

export const Notes = defineWidget({
  type: 'notes',
  name: 'Notes',
  description: 'A Markdown scratchpad saved on this device only.',
  icon: NotebookPen,
  defaultSize: { w: 4, h: 6 },
  minSize: { w: 2, h: 3 },
  settingsSchema: schema,
  Component: function NotesWidget({ settings, data, setData }) {
    const saved = NotesData.safeParse(data ?? {}).data?.text ?? '';
    const [mode, setMode] = useState<'preview' | 'edit'>(saved ? settings.startIn : 'edit');
    const [text, setText] = useState(saved);
    const area = useRef<HTMLTextAreaElement>(null);
    const toggle = useRef<HTMLButtonElement>(null);

    // Debounce writes so typing doesn't serialise the whole store on every keystroke.
    useEffect(() => {
      if (text === saved) return;
      const t = setTimeout(() => setData({ text }), 400);
      return () => clearTimeout(t);
    }, [text, saved, setData]);

    // ...but never lose the last keystrokes: write what's pending when the widget goes away
    // (another page, removed, settings) or the window does (quit from the tray, reload).
    const pending = useRef({ text, saved, setData });
    pending.current = { text, saved, setData };
    useEffect(() => {
      const flush = () => {
        const p = pending.current;
        if (p.text !== p.saved) p.setData({ text: p.text });
      };
      window.addEventListener('pagehide', flush);
      window.addEventListener('beforeunload', flush);
      return () => {
        window.removeEventListener('pagehide', flush);
        window.removeEventListener('beforeunload', flush);
        flush();
      };
    }, []);

    // Focus only when the user switches to the editor, never on page load.
    const switched = useRef(false);
    useEffect(() => {
      if (mode === 'edit' && switched.current) area.current?.focus({ preventScroll: true });
    }, [mode]);

    return (
      <div className={`relative flex h-full flex-col ${SIZES[settings.fontSize]}`}>
        <button
          ref={toggle}
          type="button"
          className="btn-icon absolute right-0 top-0 z-10 bg-surface/80 backdrop-blur"
          onClick={() => {
            setData({ text });
            switched.current = true;
            setMode(mode === 'edit' ? 'preview' : 'edit');
          }}
          aria-label={mode === 'edit' ? 'Show formatted' : 'Edit note'}
          title={mode === 'edit' ? 'Show formatted' : 'Edit'}
        >
          {mode === 'edit' ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </button>
        {mode === 'edit' ? (
          <textarea
            ref={area}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => {
              setData({ text });
              // Clicking away shows the note formatted (the toggle button does its own switch).
              if (text.trim() && e.relatedTarget !== toggle.current) setMode('preview');
            }}
            placeholder={settings.placeholder}
            aria-label="Note"
            className={`h-full w-full flex-1 resize-none rounded bg-transparent pr-8 placeholder:text-muted focus-visible:bg-surface-2/40 focus-visible:outline-offset-0 ${settings.monospace ? 'font-mono' : ''}`}
          />
        ) : (
          <div
            className="min-w-0 break-words pr-8 [overflow-wrap:anywhere]"
            onDoubleClick={() => {
              switched.current = true;
              setMode('edit');
            }}
          >
            {text ? (
              <Markdown source={text} />
            ) : (
              <p className="text-muted">{settings.placeholder}</p>
            )}
          </div>
        )}
      </div>
    );
  },
});
