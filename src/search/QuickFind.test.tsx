import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../app/settingsStore';
import { useTodos } from '../canvas/hooks';
import { FixtureTransport } from '../canvas/transport';
import { ReaderProvider } from '../reader/ReaderProvider';
import { renderWithCanvas } from '../test/render';
import { QuickFind } from './QuickFind';
import { QuickFindButton } from './QuickFindButton';
import { resetRecentCache } from './recent';
import { useQuickFind } from './store';
import { bundle, NOW } from './testData';

const onOpenSettings = vi.fn();
const onShowDashboard = vi.fn();

/** Stands in for the To-do widget: the only thing that loads the to-do list. */
function TodoWidget() {
  useTodos();
  return null;
}

function setup({ todoWidget = false } = {}) {
  const transport = new FixtureTransport(bundle);
  const openExternal = vi.spyOn(transport, 'openExternal');
  const view = renderWithCanvas(
    <ReaderProvider>
      {todoWidget && <TodoWidget />}
      <button type="button">Opener</button>
      <QuickFindButton />
      <QuickFind onOpenSettings={onOpenSettings} onShowDashboard={onShowDashboard} />
    </ReaderProvider>,
    transport,
  );
  return { ...view, transport, openExternal };
}

const ctrlK = () => fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
const input = () => screen.getByRole('combobox', { name: 'Quick find' });
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const press = (key: string, opts: object = {}) => fireEvent.keyDown(input(), { key, ...opts });
const options = () => screen.queryAllByRole('option');
const activeOption = () => {
  const id = input().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  useSettings.setState({
    onboarded: true,
    clock: '24h',
    openItemsIn: 'app',
    courseScope: 'all',
    courseNicknames: { '101': 'Machine Learning' },
  });
  useQuickFind.setState({ open: false });
  resetRecentCache();
  onOpenSettings.mockReset();
  onShowDashboard.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('Quick find', () => {
  it('opens on Ctrl+K as a combobox over a listbox', async () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => ctrlK());
    const dialog = await screen.findByRole('dialog', { name: 'Quick find' });
    expect(input()).toHaveFocus();
    const listbox = within(dialog).getByRole('listbox');
    expect(input()).toHaveAttribute('aria-controls', listbox.id);
    expect(input()).toHaveAttribute('aria-expanded');
    // Ctrl+K again closes it.
    act(() => ctrlK());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens from the top bar button, whose tooltip shows the shortcut', async () => {
    setup();
    const button = screen.getByRole('button', { name: 'Quick find' });
    expect(button).toHaveAttribute('title', expect.stringMatching(/(Ctrl\+K|⌘K)/));
    fireEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Quick find' })).toBeInTheDocument();
  });

  it('filters forgivingly, with the course colour, nickname and due time', async () => {
    setup();
    act(() => ctrlK());
    await screen.findByRole('dialog');
    type('ps4');
    await waitFor(() =>
      expect(options().map((o) => o.textContent)).toContain(
        'Problem set 4Due tomorrow 23:59 · Machine Learning',
      ),
    );
    expect(screen.queryByText('Problem set 3')).toBeNull();
    expect(screen.getByRole('group', { name: 'Due soon' })).toBeInTheDocument();

    // A course code finds the course (by its nickname) and its work.
    type('cs229');
    await waitFor(() => expect(screen.getByRole('group', { name: 'Courses' })).toBeInTheDocument());
    const courses = within(screen.getByRole('group', { name: 'Courses' }));
    expect(courses.getByText('Machine Learning')).toBeInTheDocument();
    expect(screen.getByText('Problem set 4')).toBeInTheDocument();

    type('office');
    await waitFor(() =>
      expect(
        within(screen.getByRole('group', { name: 'Announcements' })).getByText(
          'Office hours moved',
        ),
      ).toBeInTheDocument(),
    );

    type('zzzz qqq');
    expect(await screen.findByText('Nothing matches “zzzz qqq”.')).toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
  });

  it('ranks equally good matches by how soon they are due', async () => {
    setup();
    act(() => ctrlK());
    await screen.findByRole('dialog');
    type('problem set');
    await waitFor(() => expect(options().length).toBeGreaterThanOrEqual(2));
    const titles = options().map((o) => o.querySelector('.font-medium')?.textContent);
    expect(titles.slice(0, 2)).toEqual(['Problem set 4', 'Problem set 3']);
  });

  it('moves with the arrows and opens the reader on Enter', async () => {
    setup();
    act(() => ctrlK());
    await screen.findByRole('dialog');
    type('essay');
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    type('problem set');
    await waitFor(() => expect(options().length).toBeGreaterThanOrEqual(2));
    expect(activeOption()).toBe(options()[0]);
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    press('ArrowDown');
    expect(activeOption()).toBe(options()[1]);
    press('ArrowUp');
    press('ArrowUp'); // wraps to the end
    expect(activeOption()).toBe(options().at(-1));
    press('ArrowDown'); // and back to the top
    expect(activeOption()?.textContent).toContain('Problem set 4');
    press('Enter');
    expect(
      await screen.findByRole('dialog', { name: 'Assignment: Problem set 4' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Quick find' })).toBeNull();
  });

  it('opens in Canvas on Ctrl+Enter, and courses always open in Canvas', async () => {
    const { openExternal } = setup();
    act(() => ctrlK());
    await screen.findByRole('dialog');
    type('ps4');
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    press('Enter', { ctrlKey: true });
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith(
        'https://canvas.example.edu/courses/101/assignments/9004',
      ),
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => ctrlK());
    await screen.findByRole('dialog');
    type('hist 210');
    await waitFor(() => expect(activeOption()?.textContent).toContain('Modern European History'));
    press('Enter');
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith('https://canvas.example.edu/courses/102'),
    );
  });

  it('closes on Escape and gives focus back', async () => {
    setup();
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    act(() => ctrlK());
    await screen.findByRole('dialog');
    expect(input()).toHaveFocus();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('shows recent picks, then what is due in the next few days, for an empty query', async () => {
    setup();
    act(() => ctrlK());
    await screen.findByRole('dialog');
    // Nothing picked yet: just what's due soon (undone, within three days).
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Due soon' })).toBeInTheDocument(),
    );
    const due = within(screen.getByRole('group', { name: 'Due soon' }));
    expect(due.getByText('Problem set 4')).toBeInTheDocument();
    expect(due.getByText('Essay draft')).toBeInTheDocument();
    expect(due.queryByText('Source analysis')).toBeNull(); // weeks away
    expect(due.queryByText('Problem set 3')).toBeNull(); // done
    expect(screen.queryByRole('group', { name: 'Recent' })).toBeNull();

    // Pick an action, then reopen.
    type('dark');
    await waitFor(() => expect(activeOption()?.textContent).toContain('Switch to dark mode'));
    press('Enter');
    await waitFor(() => expect(useSettings.getState().theme).toBe('dark'));

    act(() => ctrlK());
    await screen.findByRole('dialog');
    const recent = within(screen.getByRole('group', { name: 'Recent' }));
    expect(recent.getByText('Switch to light mode')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('tarpaulin.quickFind.recent')!)).toEqual([
      'action:toggle-mode',
    ]);
  });

  it('keeps at most eight recent picks', async () => {
    localStorage.setItem(
      'tarpaulin.quickFind.recent',
      JSON.stringify(['action:refresh', ...Array.from({ length: 12 }, (_, i) => `gone:${i}`)]),
    );
    setup();
    act(() => ctrlK());
    await screen.findByRole('dialog');
    type('settings');
    await waitFor(() => expect(activeOption()?.textContent).toContain('Open Settings'));
    press('Enter');
    await waitFor(() => expect(onOpenSettings).toHaveBeenCalled());
    const kept = JSON.parse(localStorage.getItem('tarpaulin.quickFind.recent')!);
    expect(kept).toHaveLength(8);
    expect(kept.slice(0, 2)).toEqual(['action:settings', 'action:refresh']);
  });

  it('adds no Canvas requests of its own for lists the dashboard hasn’t loaded', async () => {
    const { transport } = setup();
    act(() => ctrlK());
    await screen.findByRole('dialog');
    type('problem');
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    const paths = transport.requests.map((r) => r.path);
    expect(paths).not.toContain('/api/v1/users/self/todo');
    expect(paths).not.toContain('/api/v1/users/self/missing_submissions');
    expect(paths).not.toContain('/api/v1/calendar_events');
  });

  it('finds to-dos a widget has loaded, without listing the same work twice', async () => {
    const { transport } = setup({ todoWidget: true });
    await waitFor(() =>
      expect(transport.requests.map((r) => r.path)).toContain('/api/v1/users/self/todo'),
    );
    act(() => ctrlK());
    await screen.findByRole('dialog');
    type('essay');
    await waitFor(() => expect(options().length).toBeGreaterThan(0));
    expect(screen.getAllByText('Essay draft')).toHaveLength(1);
    type('reading');
    await waitFor(() => expect(activeOption()?.textContent).toContain('Reading response'));
    expect(activeOption()?.textContent).toContain('Due Sun');
    expect(within(activeOption()!).getByRole('img', { name: 'To do' })).toBeInTheDocument();
  });
});
