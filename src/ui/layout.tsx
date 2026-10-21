import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Row({
  label,
  children,
  help,
}: {
  label: string;
  children: ReactNode;
  help?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="text-sm">{label}</div>
        {help && <div className="text-xs text-muted">{help}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
