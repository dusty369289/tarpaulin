import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { addDays, format } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemReader } from '../reader/ItemReader';
import type { ReaderItem } from '../reader/items';
import { fixtureBundle, recordedAt, renderWithCanvas } from '../test/render';
import { accountScope } from '../canvas/account';
import { planItemKey } from './keys';
import { usePlans } from './store';

const ACCOUNT = accountScope(fixtureBundle.meta.baseUrl, '1001');
const KEY = planItemKey('assignment', '1032', '1099');
const ITEM: ReaderItem = {
  kind: 'assignment',
  courseId: '1032',
  id: '1099',
  title: 'Problem set 4',
  courseName: 'Course A',
  color: '#336699',
  url: null,
  inline: { dueAt: '2026-10-30T22:59:00Z' },
};
const day = (d: Date) => format(d, 'yyyy-MM-dd');
const plan = () => usePlans.getState().plans[ACCOUNT]?.[KEY];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(recordedAt);
  usePlans.setState({ plans: {} });
});
afterEach(() => vi.useRealTimers());

async function openPanel(item: ReaderItem = ITEM) {
  renderWithCanvas(<ItemReader item={item} onClose={() => {}} />);
  const panel = await screen.findByTestId('plan-panel');
  // The account is known once the profile loads; the panel writes nothing before that.
  await waitFor(() => expect(panel).toHaveAttribute('data-ready', 'true'));
  return panel;
}

describe('My plan in the reader', () => {
  it('starts folded, with a one-line summary', async () => {
    const panel = await openPanel();
    const toggle = within(panel).getByRole('button', { name: /My plan/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(panel).getByTestId('plan-summary')).toHaveTextContent('Not planned yet');
    expect(within(panel).queryByRole('radiogroup')).toBeNull();
  });

  it('sets the status, a do-date and steps, under the signed-in account', async () => {
    const panel = await openPanel();
    fireEvent.click(within(panel).getByRole('button', { name: /My plan/ }));

    const status = within(panel).getByRole('radiogroup', { name: 'Status in my plan' });
    expect(within(status).getByRole('radio', { name: 'Not started' })).toBeChecked();
    fireEvent.click(within(status).getByRole('radio', { name: 'In progress' }));
    await waitFor(() => expect(plan()?.status).toBe('doing'));

    fireEvent.click(within(panel).getByRole('button', { name: 'Tomorrow' }));
    expect(plan()?.doDate).toEqual({ day: day(addDays(recordedAt, 1)), time: null });
    fireEvent.change(within(panel).getByLabelText('Time (optional)'), {
      target: { value: '14:30' },
    });
    expect(plan()?.doDate?.time).toBe('14:30');
    fireEvent.click(within(panel).getByRole('button', { name: 'Day before it’s due' }));
    expect(plan()?.doDate).toEqual({
      day: day(addDays(new Date('2026-10-30T22:59:00Z'), -1)),
      time: '14:30',
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Today' }));
    expect(plan()?.doDate?.day).toBe(day(recordedAt));

    const input = within(panel).getByRole('textbox', { name: 'New step' });
    for (const text of ['Read chapter 4', 'Draft answers']) {
      fireEvent.change(input, { target: { value: text } });
      fireEvent.keyDown(input, { key: 'Enter' });
    }
    expect(input).toHaveValue('');
    expect(plan()?.checklist.map((s) => s.text)).toEqual(['Read chapter 4', 'Draft answers']);
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Read chapter 4' }));
    expect(plan()?.checklist[0].done).toBe(true);
    fireEvent.click(within(panel).getByRole('button', { name: 'Delete step: Draft answers' }));
    expect(plan()?.checklist).toHaveLength(1);

    expect(plan()).toMatchObject({ title: 'Problem set 4', courseName: 'Course A' });
    expect(within(panel).getByTestId('plan-summary')).toHaveTextContent(
      /^In progress · Planned for Today .+ · 1 of 1 step$/,
    );
  });

  it('shows the plan already saved, and nothing from another account', async () => {
    const { edit } = usePlans.getState();
    edit(accountScope('https://other.example.edu', '1001'), KEY, () => ({ status: 'done' }));
    edit(ACCOUNT, KEY, () => ({ status: 'doing' }));
    const panel = await openPanel();
    await waitFor(() =>
      expect(within(panel).getByTestId('plan-summary')).toHaveTextContent('In progress'),
    );
    act(() => edit(ACCOUNT, KEY, () => ({ status: 'done' })));
    expect(within(panel).getByTestId('plan-summary')).toHaveTextContent('Done');
  });

  it('is only there for work', async () => {
    renderWithCanvas(
      <ItemReader
        item={{ ...ITEM, kind: 'announcement', inline: { html: '<p>Hi</p>' } }}
        onClose={() => {}}
      />,
    );
    await screen.findByTestId('item-reader');
    expect(screen.queryByTestId('plan-panel')).toBeNull();
  });

  it('isn’t there for announcements that open as discussions', async () => {
    renderWithCanvas(
      <ItemReader item={{ ...ITEM, kind: 'discussion', noPlan: true }} onClose={() => {}} />,
    );
    await screen.findByTestId('item-reader');
    expect(screen.queryByTestId('plan-panel')).toBeNull();
  });
});
