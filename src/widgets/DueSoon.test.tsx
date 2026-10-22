import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { addDays, format } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountScope } from '../canvas/account';
import { planItemKey } from '../planner/keys';
import { usePlans } from '../planner/store';
import { FIXTURE_ACCOUNT as ACCOUNT, plan } from '../test/fixtures';
import { recordedAt } from '../test/render';
import { renderWidget } from '../test/widgets';
import { defaultSettings } from './registry';

// "My plan" in Due soon, against the recorded fixtures (clock frozen at recording time).
const QUIZ_17 = planItemKey('quiz', '1028', '1094'); // "Item 17", due 23 Oct
const QUIZ_19 = planItemKey('quiz', '1028', '1097'); // "Item 19", due 30 Oct
const ITEM_20 = planItemKey('assignment', '1032', '1099'); // "Item 20", due 30 Oct

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(recordedAt);
  usePlans.setState({
    plans: {
      [ACCOUNT]: {
        [QUIZ_17]: plan({ status: 'done' }),
        [QUIZ_19]: plan({
          status: 'doing',
          doDate: { day: format(addDays(recordedAt, 1), 'yyyy-MM-dd'), time: null },
          checklist: [
            { id: 'a', text: 'a', done: true },
            { id: 'b', text: 'b', done: true },
            { id: 'c', text: 'c', done: false },
            { id: 'd', text: 'd', done: false },
          ],
        }),
      },
      // Another account's plan for the same item must not show.
      [accountScope('https://other.example.edu', '1001')]: {
        [ITEM_20]: plan({ status: 'done', doDate: { day: '2026-10-22', time: null } }),
      },
    },
  });
});
afterEach(() => vi.useRealTimers());

async function renderDueSoon(settings: Record<string, unknown> = {}) {
  renderWidget('due-soon', settings, { size: { w: 4, h: 9 } });
  await screen.findAllByTestId('due-item');
  // Plans show once the account (from the profile) is known.
  await waitFor(() => expect(document.querySelector('[data-plan-status="doing"]')).not.toBeNull());
  return () => screen.getAllByTestId('due-item');
}
const row = (rows: HTMLElement[], title: string) =>
  rows.find((r) => r.textContent?.includes(title))!;

describe('Due soon with My plan', () => {
  it('shows the plan at a glance: status, do-date chip and step progress', async () => {
    const rows = (await renderDueSoon({ groupBy: 'none' }))();
    const r19 = row(rows, 'Item 19');
    expect(r19).toHaveAttribute('data-plan-status', 'doing');
    expect(within(r19).getByText('Plan: Tomorrow')).toBeInTheDocument();
    expect(within(r19).getByLabelText('2 of 4 steps done')).toHaveTextContent('2/4');
    expect(
      within(r19).getByRole('button', { name: 'Item 19: In progress in my plan. Mark done' }),
    ).toBeInTheDocument();
    // Another account's plan for Item 20 doesn't leak in.
    const r20 = row(rows, 'Item 20');
    expect(r20).not.toHaveAttribute('data-plan-status');
    expect(within(r20).queryByText(/^Plan:/)).toBeNull();
    expect(
      within(r20).getByRole('button', {
        name: 'Item 20: Not started in my plan. Mark in progress',
      }),
    ).toBeInTheDocument();
  });

  it('dims work done in my plan and lists it after the rest', async () => {
    const rows = (await renderDueSoon({ groupBy: 'none' }))();
    const r17 = row(rows, 'Item 17');
    expect(rows.at(-1)).toBe(r17);
    expect(within(r17).getByRole('button', { name: 'Item 17' })).toHaveClass('text-muted');
    expect(within(row(rows, 'Item 19')).getByRole('button', { name: 'Item 19' })).not.toHaveClass(
      'text-muted',
    );
  });

  it('keeps day groups in order, done work last within its day', async () => {
    const rows = (await renderDueSoon({ groupBy: 'day' }))();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings.indexOf('Friday')).toBeLessThan(headings.indexOf('Fri 30 Oct'));
    expect(rows.indexOf(row(rows, 'Item 17'))).toBeLessThan(rows.indexOf(row(rows, 'Item 19')));
  });

  it('cycles the status from the row, under the signed-in account only', async () => {
    const rows = (await renderDueSoon({ groupBy: 'none' }))();
    const button = within(row(rows, 'Item 20')).getByTestId('plan-status');
    fireEvent.click(button);
    expect(usePlans.getState().plans[ACCOUNT][ITEM_20]).toMatchObject({
      status: 'doing',
      title: 'Item 20',
    });
    expect(button).toHaveAccessibleName('Item 20: In progress in my plan. Mark done');
    fireEvent.click(button);
    expect(usePlans.getState().plans[ACCOUNT][ITEM_20].status).toBe('done');
    expect(screen.getAllByTestId('due-item').at(-1)).toHaveTextContent('Item 20');
    // The other account's plan for the same item is untouched.
    expect(
      usePlans.getState().plans[accountScope('https://other.example.edu', '1001')][ITEM_20].doDate,
    ).not.toBeNull();
  });

  it('can hide work marked done in my plan', async () => {
    const rows = (await renderDueSoon({ groupBy: 'none', hidePlanDone: true }))();
    expect(rows.some((r) => r.textContent?.includes('Item 17'))).toBe(false);
    expect(rows.some((r) => r.textContent?.includes('Item 19'))).toBe(true);
  });

  it('offers the option in its settings, off by default', () => {
    expect(defaultSettings('due-soon')).toMatchObject({ hidePlanDone: false });
  });
});
