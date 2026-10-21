import { Check } from 'lucide-react';
import { useState } from 'react';
import { useSettings } from '../app/settingsStore';
import { buildPage, PRESETS } from '../dashboard/presets';
import { useDashboard } from '../dashboard/store';
import { GRID_COLS } from '../dashboard/types';
import { LookPicker } from '../theme/pickers';
import { THEMES, type ThemeName } from '../theme/themes';

// First-launch step after connecting: pick a look, colour mode and a starting layout. Everything
// defaults to the plain look following the system's light/dark mode, so "Continue" without
// touching anything changes nothing. Shown once.

const MODES: Array<{ id: 'system' | ThemeName; name: string; hint: string }> = [
  { id: 'system', name: 'Match system', hint: 'Light or dark with your OS' },
  { id: 'light', name: 'Light', hint: 'Always light' },
  { id: 'dark', name: 'Dark', hint: 'Always dark' },
  { id: 'high-contrast', name: 'High contrast', hint: 'Maximum legibility' },
];

const ACCENTS = ['', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#7c3aed'];

const rgb = (triple: string) => `rgb(${triple})`;

/** A tiny dashboard drawn in a theme's colours. */
function ThemePreview({ mode, accent }: { mode: 'system' | ThemeName; accent: string }) {
  const halves: ThemeName[] = mode === 'system' ? ['light', 'dark'] : [mode];
  return (
    <span aria-hidden className="flex h-20 overflow-hidden rounded-md border border-border">
      {halves.map((name) => {
        const t = THEMES[name];
        const acc = accent && name !== 'high-contrast' ? accent : rgb(t.accent);
        return (
          <span key={name} className="flex flex-1 gap-1 p-1.5" style={{ background: rgb(t.bg) }}>
            {[0.9, 0.6].map((h, i) => (
              <span
                key={i}
                className="flex flex-1 flex-col gap-1 rounded p-1"
                style={{ background: rgb(t.surface), border: `1px solid ${rgb(t.border)}` }}
              >
                <span className="h-1.5 w-2/3 rounded-full" style={{ background: acc }} />
                <span
                  className="h-1 rounded-full"
                  style={{ background: rgb(t.muted), opacity: 0.6, width: `${h * 100}%` }}
                />
                <span
                  className="h-1 w-1/2 rounded-full"
                  style={{ background: rgb(t.muted), opacity: 0.4 }}
                />
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}

/** A preset's real grid positions, as a wireframe. */
function LayoutPreview({ presetId }: { presetId: string }) {
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const rows = Math.max(...preset.widgets.map((w) => w.y + w.h));
  return (
    <span aria-hidden className="relative block h-20 overflow-hidden rounded-md bg-surface-2">
      {preset.widgets.map((w, i) => (
        <span
          key={i}
          className="absolute rounded-sm border border-accent/40 bg-accent/15"
          style={{
            left: `calc(${(w.x / GRID_COLS) * 100}% + 2px)`,
            top: `calc(${(w.y / rows) * 100}% + 2px)`,
            width: `calc(${(w.w / GRID_COLS) * 100}% - 4px)`,
            height: `calc(${(w.h / rows) * 100}% - 4px)`,
          }}
        />
      ))}
    </span>
  );
}

export function Personalize() {
  const { theme, accent, background, widgetStyle, update } = useSettings();
  const replacePages = useDashboard((s) => s.replacePages);
  const [presetId, setPresetId] = useState(PRESETS[0].id);

  const finish = (applyLayout: boolean) => {
    if (applyLayout) {
      const preset = PRESETS.find((p) => p.id === presetId)!;
      replacePages([buildPage(preset, 'Home')]);
    }
    update({ onboarded: true });
  };

  const tile = (selected: boolean) =>
    `flex flex-col gap-2 rounded-theme border p-2 text-left transition ${selected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-muted'}`;

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card flex w-full max-w-3xl flex-col gap-6 p-6 shadow-xl animate-pop-in">
        <div>
          <h1 className="text-xl font-semibold">Make it yours</h1>
          <p className="text-sm text-muted">
            Pick a starting look and layout. You can fine-tune all of it later: mix backgrounds and
            widget styles, give each page or even each widget its own style, and change colours and
            fonts in Settings.
          </p>
        </div>

        <section aria-labelledby="look-heading" className="flex flex-col gap-3">
          <h2
            id="look-heading"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Look
          </h2>
          <LookPicker
            value={{ background, widgetStyle }}
            onPick={(look) =>
              update({ background: look.background, widgetStyle: look.widgetStyle })
            }
          />
        </section>

        <section aria-labelledby="mode-heading" className="flex flex-col gap-3">
          <h2
            id="mode-heading"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Colour mode
          </h2>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={theme === m.id}
                onClick={() => update({ theme: m.id })}
                className={tile(theme === m.id)}
              >
                <ThemePreview mode={m.id} accent={accent} />
                <span className="flex items-center justify-between text-sm font-medium">
                  {m.name}
                  {m.id === 'system' && (
                    <span className="chip bg-surface-2 text-muted">Default</span>
                  )}
                </span>
                <span className="-mt-1.5 text-xs text-muted">{m.hint}</span>
              </button>
            ))}
          </div>
          <div
            role="radiogroup"
            aria-label="Accent colour"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="mr-1 text-sm text-muted">Accent</span>
            {ACCENTS.map((c) => {
              const selected = accent === c;
              return (
                <button
                  key={c || 'default'}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={c ? `Accent ${c}` : 'Theme default accent'}
                  onClick={() => update({ accent: c })}
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${selected ? 'border-text' : 'border-transparent'}`}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
                    style={
                      c
                        ? { background: c }
                        : {
                            background: 'rgb(var(--surface-2))',
                            border: '1px dashed rgb(var(--muted))',
                          }
                    }
                  >
                    {selected && (
                      <Check
                        className="h-3.5 w-3.5"
                        style={{ color: c ? '#fff' : 'rgb(var(--text))' }}
                      />
                    )}
                    {!c && !selected && 'A'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="layout-heading" className="flex flex-col gap-3">
          <h2
            id="layout-heading"
            className="text-xs font-semibold uppercase tracking-wide text-muted"
          >
            Starting layout
          </h2>
          <div
            role="radiogroup"
            aria-label="Starting layout"
            className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={presetId === p.id}
                onClick={() => setPresetId(p.id)}
                className={tile(presetId === p.id)}
              >
                <LayoutPreview presetId={p.id} />
                <span className="text-sm font-medium">{p.name}</span>
                <span className="-mt-1.5 text-xs text-muted">{p.description}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted">
            You can add pages, rearrange widgets and change all of this any time.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => finish(false)}>
              Skip
            </button>
            <button type="button" className="btn btn-primary" onClick={() => finish(true)}>
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
