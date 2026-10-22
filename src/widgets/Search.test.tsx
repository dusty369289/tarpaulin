import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettings } from '../app/settingsStore';
import { FixtureTransport } from '../canvas/transport';
import { WidgetHost } from '../dashboard/WidgetHost';
import { ReaderProvider } from '../reader/ReaderProvider';
import { resetRecentCache } from '../search/recent';
import { bundle, NOW } from '../search/testData';
import { renderWithCanvas } from '../test/render';
import { defaultSettings } from './registry';
import type { WidgetSize } from './types';

const SMALL: WidgetSize = { w: 4, h: 2 };
const TALL: WidgetSize = { w: 4, h: 8 };

function setup(size: WidgetSize, settings: Record<string, unknown> = {}) {
  const transport = new FixtureTransport(bundle);
  const openExternal = vi.spyOn(transport, 'openExternal');
  renderWithCanvas(
    <ReaderProvider>
      <WidgetHost
        id="s"
        instance={{ type: 'search', settings: { ...defaultSettings('search'), ...settings } }}
        size={size}
        editMode={false}
        onData={() => {}}
      />
    </ReaderProvider>,
    transport,
  );
  return { openExternal };
}

const input = () => screen.getByRole('combobox', { name: 'Search' });
const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
const press = (key: string, opts: object = {}) => fireEvent.keyDown(input(), { key, ...opts });
const activeOption = () => {
  const id = input().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  useSettings.setState({
    clock: '24h',
    openItemsIn: 'app',
    courseScope: 'all',
    courseNicknames: { '101': 'Machine Learning' },
  });
  resetRecentCache();
});
afterEach(() => vi.useRealTimers());

describe('Search widget, tall', () => {
  it('lists what is due soon while empty', async () => {
    setup(TALL);
    const due = await screen.findByRole('group', { name: 'Due soon' });
    expect(within(due).getByText('Problem set 4')).toBeInTheDocument();
    expect(within(due).getByText('Essay draft')).toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(input()).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
  });

  it('filters as you type, and Enter opens the reader', async () => {
    setup(TALL);
    await screen.findByRole('group', { name: 'Due soon' });
    type('ps4');
    await waitFor(() => expect(activeOption()?.textContent).toContain('Problem set 4'));
    expect(screen.queryByText('Essay draft')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    press('Enter');
    expect(
      await screen.findByRole('dialog', { name: 'Assignment: Problem set 4' }),
    ).toBeInTheDocument();
  });

  it('moves with the arrows and opens in Canvas on Ctrl+Enter', async () => {
    const { openExternal } = setup(TALL);
    await screen.findByRole('group', { name: 'Due soon' });
    type('problem set');
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(2));
    press('ArrowDown');
    expect(activeOption()?.textContent).toContain('Problem set 3');
    press('Enter', { ctrlKey: true });
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith(
        'https://canvas.example.edu/courses/101/assignments/9003',
      ),
    );
  });

  it('says so when nothing matches, and Escape clears the field', async () => {
    setup(TALL);
    await screen.findByRole('group', { name: 'Due soon' });
    type('zzzz');
    expect(await screen.findByText('Nothing matches “zzzz”.')).toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    press('Escape');
    expect(input()).toHaveValue('');
  });

  it('puts group labels in their own column when wide', async () => {
    setup({ w: 8, h: 8 });
    await screen.findByRole('group', { name: 'Due soon' });
    expect(screen.getByRole('listbox')).toHaveClass('qf-wide');
  });
});

describe('Search widget, small', () => {
  it('is just a field until you type; results drop down over the page', async () => {
    setup(SMALL);
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText(/Ctrl K|⌘K/)).toBeInTheDocument();

    type('ps4');
    const dropdown = await screen.findByTestId('search-dropdown');
    // Outside the widget frame, so the frame can't clip it.
    expect(screen.getByTestId('widget-frame').contains(dropdown)).toBe(false);
    await waitFor(() => expect(activeOption()?.textContent).toContain('Problem set 4'));
    expect(input()).toHaveAttribute('aria-expanded', 'true');

    press('Escape');
    expect(screen.queryByTestId('search-dropdown')).toBeNull();
    expect(input()).toHaveValue('ps4');
    press('ArrowDown'); // opens it again
    expect(await screen.findByTestId('search-dropdown')).toBeInTheDocument();
  });

  it('Enter opens the reader and closes the dropdown', async () => {
    setup(SMALL);
    type('essay');
    await waitFor(() => expect(activeOption()?.textContent).toContain('Essay draft'));
    press('Enter');
    expect(await screen.findByRole('dialog', { name: 'Assignment: Essay draft' })).toBeVisible();
    expect(screen.queryByTestId('search-dropdown')).toBeNull();
  });
});

describe('Search widget settings', () => {
  it('searches only the groups switched on', async () => {
    setup(TALL, { courses: false });
    await screen.findByRole('group', { name: 'Due soon' });
    type('cs229');
    await waitFor(() => expect(screen.getByText('Problem set 4')).toBeInTheDocument());
    expect(screen.queryByRole('group', { name: 'Courses' })).toBeNull();

    type('office');
    expect(await screen.findByRole('group', { name: 'Announcements' })).toBeInTheDocument();
  });

  it('leaves out work when it is switched off, due soon included', async () => {
    setup(TALL, { work: false });
    type('problem');
    await waitFor(() => expect(screen.getByText('Nothing matches “problem”.')).toBeInTheDocument());
    type('');
    expect(screen.getByText('Type to find anything.')).toBeInTheDocument();
  });

  it('can stay blank when empty', async () => {
    setup(TALL, { dueWhenEmpty: false });
    expect(await screen.findByText('Type to find anything.')).toBeInTheDocument();
    type('essay');
    await waitFor(() => expect(screen.getByText('Essay draft')).toBeInTheDocument());
  });

  it('asks for a group when every one is off', () => {
    setup(TALL, {
      work: false,
      announcements: false,
      events: false,
      courses: false,
      pages: false,
      actions: false,
    });
    expect(screen.getByText('Pick what to search in this widget’s settings.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
