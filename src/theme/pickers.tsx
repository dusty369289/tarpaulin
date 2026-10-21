import { Check } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { BACKGROUNDS, getBackground } from './backgrounds';
import { LOOKS, type Look } from './looks';
import { useMode } from './mode';
import { getSkin, SKINS } from './skins';
import type { Mode } from './themes';

// Pickers for looks, page backgrounds and widget styles, shared by first-launch setup, Settings,
// the page style drawer and each widget's settings. Every swatch draws the variant of the current
// mode (light, or dark for dark and high contrast) unless it is given one.

function Tile({
  selected,
  onClick,
  label,
  hint,
  children,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className={`flex min-w-0 flex-col gap-1.5 rounded-theme border bg-surface p-1.5 text-left transition ${selected ? 'border-accent ring-2 ring-accent/30' : 'border-border hover:border-muted'}`}
    >
      {children}
      <span className="flex min-w-0 items-center gap-1 px-0.5 text-xs font-medium">
        <span className="truncate">{label}</span>
        {selected && <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />}
      </span>
      {hint && <span className="-mt-1 line-clamp-2 px-0.5 text-[11px] text-muted">{hint}</span>}
    </button>
  );
}

interface SwatchProps {
  id: string;
  className?: string;
  /** Which variant to draw; defaults to the current mode. */
  mode?: Mode;
}

/** A background's texture, as a small swatch. */
export function BackgroundSwatch({ id, className = '', mode }: SwatchProps) {
  const current = useMode();
  const m = mode ?? current;
  const bg = getBackground(id);
  return (
    <span
      aria-hidden
      data-mode={m}
      className={`block rounded-md border border-border/60 ${bg.tokens ? `bg-pattern-${bg.id}` : ''} ${className}`}
      style={bg.tokens ? undefined : { background: bg.swatch[m] }}
    />
  );
}

/** A widget style's look, as a small swatch shaped like the widget. */
export function SkinSwatch({ id, className = '', mode }: SwatchProps) {
  const current = useMode();
  const m = mode ?? current;
  const skin = getSkin(id);
  const style: CSSProperties = { background: skin.swatch[m] };
  return (
    <span
      aria-hidden
      data-skin-swatch={skin.id}
      data-mode={m}
      className={`skin-swatch block border border-border ${className}`}
      style={style}
    />
  );
}

/** A background with two widgets in a style on it. */
export function LookPreview({
  look,
  mode,
  className = 'h-16',
}: {
  look: Pick<Look, 'background' | 'widgetStyle'>;
  mode?: Mode;
  className?: string;
}) {
  return (
    <span className={`relative flex gap-1.5 overflow-hidden rounded-md p-2 ${className}`}>
      <BackgroundSwatch id={look.background} mode={mode} className="absolute inset-0 rounded-md" />
      <SkinSwatch id={look.widgetStyle} mode={mode} className="relative h-full flex-[3]" />
      <SkinSwatch id={look.widgetStyle} mode={mode} className="relative h-3/4 flex-[2]" />
    </span>
  );
}

export function LookPicker({
  value,
  onPick,
  columns = 'grid-cols-2 sm:grid-cols-4',
}: {
  value: { background: string; widgetStyle: string };
  onPick: (look: Look) => void;
  columns?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Look" className={`grid gap-2 ${columns}`}>
      {LOOKS.map((look) => (
        <Tile
          key={look.id}
          testId={`look-${look.id}`}
          selected={value.background === look.background && value.widgetStyle === look.widgetStyle}
          onClick={() => onPick(look)}
          label={look.name}
          hint={look.description}
        >
          <LookPreview look={look} />
        </Tile>
      ))}
    </div>
  );
}

export function BackgroundPicker({
  value,
  onChange,
  inherit,
}: {
  /** '' means inherit, when `inherit` is given. */
  value: string;
  onChange: (id: string) => void;
  /** The inherited option: its label and the background it currently resolves to. */
  inherit?: { label: string; id: string };
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Background"
      className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2"
    >
      {inherit && (
        <Tile
          selected={value === ''}
          onClick={() => onChange('')}
          label={inherit.label}
          hint={getBackground(inherit.id).name}
        >
          <span className="block rounded-md border border-dashed border-muted p-1">
            <BackgroundSwatch id={inherit.id} className="h-8" />
          </span>
        </Tile>
      )}
      {BACKGROUNDS.map((b) => (
        <Tile
          key={b.id}
          testId={`background-${b.id}`}
          selected={value === b.id}
          onClick={() => onChange(b.id)}
          label={b.name}
        >
          <BackgroundSwatch id={b.id} className="h-10" />
        </Tile>
      ))}
    </div>
  );
}

export function SkinPicker({
  value,
  onChange,
  inherit,
  label = 'Widget style',
}: {
  value: string;
  onChange: (id: string) => void;
  inherit?: { label: string; id: string };
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2"
    >
      {inherit && (
        <Tile
          selected={value === ''}
          onClick={() => onChange('')}
          label={inherit.label}
          hint={getSkin(inherit.id).name}
        >
          <span className="block rounded-md border border-dashed border-muted p-1">
            <SkinSwatch id={inherit.id} className="h-8" />
          </span>
        </Tile>
      )}
      {SKINS.map((s) => (
        <Tile
          key={s.id}
          testId={`skin-${s.id}`}
          selected={value === s.id}
          onClick={() => onChange(s.id)}
          label={s.name}
        >
          <SkinSwatch id={s.id} className="h-10" />
        </Tile>
      ))}
    </div>
  );
}

/** Paper colours of one widget style, plus "Mixed"/"Default". */
export function PaperPicker({
  skinId,
  value,
  onChange,
}: {
  skinId: string;
  value: string;
  onChange: (paper: string) => void;
}) {
  const mode = useMode();
  const skin = getSkin(skinId);
  if (!skin.papers?.length) return null;
  const options = [
    { id: 'auto', name: skin.mixPapers ? 'Mixed' : 'Default', swatch: '' },
    ...skin.papers.map((p) => ({ id: p.id, name: p.name, swatch: p.swatch[mode] })),
  ];
  return (
    <div role="radiogroup" aria-label="Paper colour" className="flex flex-wrap items-center gap-2">
      {options.map((p) => {
        const selected =
          value === p.id || (p.id === 'auto' && !skin.papers!.some((x) => x.id === value));
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={p.name}
            title={p.name}
            onClick={() => onChange(p.id)}
            className={`flex h-8 items-center justify-center rounded-full border-2 transition ${selected ? 'border-accent' : 'border-transparent'} ${p.swatch ? 'w-8' : 'px-2 text-xs'}`}
          >
            {p.swatch ? (
              <span
                className="h-6 w-6 rounded-full border border-border"
                style={{ background: p.swatch }}
              />
            ) : (
              p.name
            )}
          </button>
        );
      })}
    </div>
  );
}
