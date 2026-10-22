import { ChevronRight } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDashboard } from '../../dashboard/store';
import { BackgroundPicker, LookPicker, SkinPicker } from '../../theme/pickers';
import { Row, Section, Segmented, Switch, useSettingsFilter, type SegmentedOption } from '../../ui';
import { useSettings, type Settings } from '../settingsStore';

/** Light, Dark, Match system, High contrast, as one segmented control. */
const MODES: Array<SegmentedOption<Settings['theme']>> = [
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['system', 'Match system'],
  ['high-contrast', 'High contrast'],
];

/** Settings most people never need, folded away until asked for. Search looks inside anyway. */
function MoreStyling({ children }: { children: ReactNode }) {
  const query = useSettingsFilter();
  const [open, setOpen] = useState(false);
  const id = useId();
  if (query) return <>{children}</>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          className="btn btn-ghost -ml-2"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden
          />
          More styling
        </button>
        {!open && (
          <span className="text-xs text-muted">
            Background, widget style, corners and the top bar
          </span>
        )}
      </div>
      {open && (
        <div id={id} className="flex flex-col gap-6 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

export function AppearanceSettings() {
  const s = useSettings(
    useShallow((s) => ({
      theme: s.theme,
      accent: s.accent,
      font: s.font,
      fontScale: s.fontScale,
      radius: s.radius,
      barStyle: s.barStyle,
      barFoldAway: s.barFoldAway,
      background: s.background,
      widgetStyle: s.widgetStyle,
    })),
  );
  const update = useSettings((s) => s.update);
  const applyWidgetStyle = useDashboard((s) => s.applyWidgetStyle);
  const clearPageBackgrounds = useDashboard((s) => s.clearPageBackgrounds);
  const look = { background: s.background, widgetStyle: s.widgetStyle };
  return (
    <>
      <Section>
        <Row
          stacked
          label="Look"
          help="A look sets the background and the widget style together, on every page. Each page can have its own (Edit › Style), and each widget too (its settings). Every look has a light and a dark version, picked by Mode below."
          keywords="theme style"
        >
          <LookPicker
            value={look}
            columns="grid-cols-2 lg:grid-cols-4"
            onPick={(l) => {
              update({ background: l.background, widgetStyle: l.widgetStyle });
              applyWidgetStyle(null, l.widgetStyle);
              clearPageBackgrounds();
            }}
          />
        </Row>
      </Section>
      <Section>
        <Row
          label="Mode"
          help="Every look has a light and a dark version. High contrast swaps in maximum-contrast colours and keeps each style's shape and fonts."
          keywords="theme light dark system high contrast"
        >
          <Segmented
            label="Mode"
            value={s.theme}
            options={MODES}
            onChange={(theme) => update({ theme })}
          />
        </Row>
        <Row
          label="Accent colour"
          help={s.theme === 'high-contrast' ? 'High contrast keeps its own accent.' : undefined}
          keywords="color"
        >
          {s.accent && (
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => update({ accent: '' })}
            >
              Reset
            </button>
          )}
          <input
            type="color"
            aria-label="Accent colour"
            value={s.accent || '#4f46e5'}
            onChange={(e) => update({ accent: e.target.value })}
            className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
          />
        </Row>
        <Row label="Font" keywords="typeface">
          <select
            className="input w-auto"
            aria-label="Font"
            value={s.font}
            onChange={(e) => update({ font: e.target.value as Settings['font'] })}
          >
            <option value="system">System</option>
            <option value="rounded">Rounded</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
            <option value="readable">Extra readable</option>
          </select>
        </Row>
        <Row label="Text size" keywords="font zoom scale">
          <input
            type="range"
            aria-label="Text size"
            min={0.85}
            max={1.3}
            step={0.05}
            value={s.fontScale}
            onChange={(e) => update({ fontScale: Number(e.target.value) })}
            className="accent-[rgb(var(--accent))]"
          />
          <span className="w-10 text-right text-xs tabular-nums">
            {Math.round(s.fontScale * 100)}%
          </span>
        </Row>
      </Section>
      <MoreStyling>
        <Section title="Page and widgets">
          <Row stacked label="Background" help="The page behind the widgets." keywords="texture">
            <BackgroundPicker
              value={s.background}
              onChange={(background) => update({ background })}
            />
          </Row>
          <Row stacked label="Widget style" keywords="skin card">
            <SkinPicker value={s.widgetStyle} onChange={(widgetStyle) => update({ widgetStyle })} />
          </Row>
          <Row label="Corner radius" keywords="rounded corners">
            <input
              type="range"
              aria-label="Corner radius"
              min={0}
              max={24}
              value={s.radius}
              onChange={(e) => update({ radius: Number(e.target.value) })}
              className="accent-[rgb(var(--accent))]"
            />
            <span className="w-10 text-right text-xs tabular-nums">{s.radius}px</span>
          </Row>
        </Section>
        <Section title="Top bar">
          <Row
            label="Top bar style"
            help="Frosted glass that the page shows through, or a plain strip."
            keywords="header"
          >
            <select
              className="input w-auto"
              aria-label="Top bar style"
              value={s.barStyle}
              onChange={(e) => update({ barStyle: e.target.value as Settings['barStyle'] })}
            >
              <option value="frosted">Frosted</option>
              <option value="basic">Basic</option>
            </select>
          </Row>
          <Row
            label="Fold away the top bar"
            help="Gives the page the full window. Point at the top edge or press Tab to bring it back. Always shown on touch screens."
            keywords="header hide"
          >
            <Switch
              hideLabel
              label="Fold away the top bar"
              checked={s.barFoldAway}
              onChange={(on) => update({ barFoldAway: on })}
            />
          </Row>
        </Section>
      </MoreStyling>
    </>
  );
}
