import { Fragment, type ReactNode } from 'react';

// A deliberately small Markdown renderer for the Notes widget. It builds React elements rather
// than HTML strings, so nothing typed into a note can inject markup or script.

const SAFE_URL = /^(https?:|mailto:)/i;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|~~([^~]+)~~)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2]) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={key}>{m[3]}</em>);
    else if (m[4])
      out.push(
        <code key={key} className="rounded bg-surface-2 px-1 text-[0.9em]">
          {m[4]}
        </code>,
      );
    else if (m[5] && m[6]) {
      out.push(
        SAFE_URL.test(m[6]) ? (
          <a
            key={key}
            href={m[6]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent underline"
          >
            {m[5]}
          </a>
        ) : (
          m[5]
        ),
      );
    } else if (m[7]) out.push(<s key={key}>{m[7]}</s>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag
        key={`l${blocks.length}`}
        className={list.ordered ? 'ml-5 list-decimal' : 'ml-5 list-disc'}
      >
        {list.items}
      </Tag>,
    );
    list = null;
  };
  lines.forEach((line, n) => {
    const key = `b${n}`;
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(\[( |x)\]\s+)?(.*)$/i);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered && !bullet);
      if (list && list.ordered !== isOrdered) flush();
      list ??= { ordered: isOrdered, items: [] };
      const body = bullet ? bullet[3] : ordered![1];
      const task = bullet?.[1];
      list.items.push(
        <li key={key}>
          {task ? (
            <input
              type="checkbox"
              disabled
              checked={/x/i.test(bullet![2])}
              className="mr-1 align-middle"
            />
          ) : null}
          {inline(body, key)}
        </li>,
      );
      return;
    }
    flush();
    if (heading) {
      const size = ['text-lg font-semibold', 'text-base font-semibold', 'text-sm font-semibold'][
        heading[1].length - 1
      ];
      blocks.push(
        <p key={key} className={size}>
          {inline(heading[2], key)}
        </p>,
      );
    } else if (/^\s*>\s?/.test(line)) {
      blocks.push(
        <blockquote key={key} className="border-l-2 border-border pl-2 text-muted">
          {inline(line.replace(/^\s*>\s?/, ''), key)}
        </blockquote>,
      );
    } else if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={key} className="border-border" />);
    } else if (line.trim() === '') {
      blocks.push(<div key={key} className="h-2" />);
    } else {
      blocks.push(<p key={key}>{inline(line, key)}</p>);
    }
  });
  flush();
  return <Fragment>{blocks}</Fragment>;
}
