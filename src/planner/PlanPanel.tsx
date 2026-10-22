import { addDays, subDays } from 'date-fns';
import { ChevronDown, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useNow } from '../canvas/hooks';
import { dayKey, toDate, useTimeFormat } from '../lib/dates';
import { Radio, RadioGroup } from '../ui/RadioGroup';
import { usePlanEditor } from './hooks';
import { StepProgress } from './PlanBits';
import { PlanStatusIcon } from './PlanStatusIcon';
import { planSummary, STATUS_LABEL } from './selectors';
import { PLAN_STATUSES } from './store';

/**
 * "My plan" in the reader: status, a do-date and a checklist for one piece of work. Folded to a
 * one-line summary by default, so the item's content stays near the top. Nothing here goes to
 * Canvas.
 */
export function PlanPanel({
  planKey,
  title,
  courseName,
  dueAt,
}: {
  planKey: string;
  title: string;
  courseName: string;
  dueAt: string | null;
}) {
  const now = useNow(60_000);
  const timeFmt = useTimeFormat();
  const editor = usePlanEditor(planKey, { title, courseName, dueAt });
  const { plan } = editor;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const id = useId();
  const summary = planSummary(plan, now, timeFmt);
  const due = toDate(dueAt);
  const dayBefore = due ? dayKey(subDays(due, 1)) : null;
  const picks = [
    { label: 'Today', day: dayKey(now) },
    { label: 'Tomorrow', day: dayKey(addDays(now, 1)) },
    ...(dayBefore ? [{ label: 'Day before it’s due', day: dayBefore }] : []),
  ];
  const pickDay = (day: string) => editor.setDoDate({ day, time: plan.doDate?.time ?? null });
  const add = () => {
    editor.addStep(draft);
    setDraft('');
  };

  return (
    <section
      aria-label="My plan"
      data-testid="plan-panel"
      data-ready={editor.ready}
      className="rounded-theme border border-border bg-surface"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 items-center gap-2 rounded-theme px-3 py-2 text-left text-sm hover:bg-surface-2"
      >
        <PlanStatusIcon status={plan.status} />
        <span className="shrink-0 font-medium">My plan</span>
        <span className="min-w-0 flex-1 truncate text-muted" data-testid="plan-summary">
          {summary.label}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-3 border-t border-border px-3 pb-3 pt-2.5">
          <RadioGroup
            label="Status in my plan"
            value={plan.status}
            options={[...PLAN_STATUSES]}
            onChange={(s) => editor.setStatus(s as (typeof PLAN_STATUSES)[number])}
            className="inline-flex w-fit max-w-full flex-wrap gap-0.5 rounded-md border border-border p-0.5"
          >
            {PLAN_STATUSES.map((s) => (
              <Radio
                key={s}
                value={s}
                label={STATUS_LABEL[s]}
                className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${
                  plan.status === s ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
                }`}
              >
                <PlanStatusIcon status={s} className="h-3.5 w-3.5" />
                {STATUS_LABEL[s]}
              </Radio>
            ))}
          </RadioGroup>

          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="label">I’ll do it on</legend>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="date"
                aria-label="Do date"
                className="input w-auto"
                value={plan.doDate?.day ?? ''}
                onChange={(e) =>
                  e.target.value ? pickDay(e.target.value) : editor.setDoDate(null)
                }
              />
              <input
                type="time"
                aria-label="Time (optional)"
                className="input w-auto"
                disabled={!plan.doDate}
                value={plan.doDate?.time ?? ''}
                onChange={(e) =>
                  plan.doDate &&
                  editor.setDoDate({ day: plan.doDate.day, time: e.target.value || null })
                }
              />
              {plan.doDate && (
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-xs"
                  onClick={() => editor.setDoDate(null)}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {picks.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  aria-pressed={plan.doDate?.day === p.day}
                  className={`btn px-2 py-0.5 text-xs ${plan.doDate?.day === p.day ? 'border-accent' : ''}`}
                  onClick={() => pickDay(p.day)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="label mb-0" id={`${id}-steps`}>
                Steps
              </span>
              <StepProgress
                done={summary.stepsDone}
                total={summary.stepsTotal}
                className="text-xs text-muted"
              />
            </div>
            {plan.checklist.length > 0 && (
              <ul aria-labelledby={`${id}-steps`} className="flex flex-col gap-0.5">
                {plan.checklist.map((s) => (
                  <li key={s.id} className="group flex min-w-0 items-center gap-2 text-sm">
                    <label className="flex min-w-0 flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={s.done}
                        onChange={() => editor.toggleStep(s.id)}
                        className="h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                      />
                      <span
                        className={`min-w-0 [overflow-wrap:anywhere] ${s.done ? 'text-muted line-through' : ''}`}
                      >
                        {s.text}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn-icon h-6 w-6 shrink-0"
                      aria-label={`Delete step: ${s.text}`}
                      title="Delete step"
                      onClick={() => editor.removeStep(s.id)}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                className="input"
                aria-label="New step"
                placeholder="Add a step, then press Enter"
                maxLength={500}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              <button
                type="button"
                className="btn shrink-0 px-2"
                aria-label="Add step"
                disabled={!draft.trim()}
                onClick={add}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted">Kept on this device only. Never sent to Canvas.</p>
        </div>
      )}
    </section>
  );
}
