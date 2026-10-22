import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, useSettings } from '../app/settingsStore';
import { PRESETS } from '../dashboard/presets';
import { useDashboard } from '../dashboard/store';
import { Personalize } from './Personalize';

beforeEach(() => {
  useSettings.setState(DEFAULT_SETTINGS);
  useDashboard.setState(useDashboard.getInitialState());
});

/** How many of a group's radios Tab can reach. */
const tabStops = (group: HTMLElement) =>
  within(group)
    .getAllByRole('radio')
    .filter((r) => r.tabIndex === 0).length;

describe('Personalize', () => {
  it('starts on Match system, the default accent and the first layout', () => {
    render(<Personalize />);
    const checked = screen.getAllByRole('radio', { checked: true }).map((r) => r.textContent);
    expect(checked.some((t) => t?.startsWith('Match system'))).toBe(true);
    expect(checked.some((t) => t?.startsWith('Deadline Focus'))).toBe(true);
    expect(screen.getByRole('radio', { name: 'Theme default accent' })).toBeChecked();
  });

  it('makes each picker one Tab stop', () => {
    render(<Personalize />);
    for (const name of ['Theme', 'Accent colour', 'Starting layout'])
      expect(tabStops(screen.getByRole('radiogroup', { name }))).toBe(1);
  });

  it('names each option and describes it with its hint', () => {
    render(<Personalize />);
    const dark = screen.getByRole('radio', { name: 'Dark' });
    expect(dark).toHaveAccessibleDescription('The dark version of your look');
    expect(screen.getByRole('radio', { name: 'Deadline Focus' })).toHaveAttribute(
      'aria-describedby',
    );
  });

  it('picks with a click or the arrow keys, and applies the mode live', async () => {
    const user = userEvent.setup();
    render(<Personalize />);
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(useSettings.getState().theme).toBe('dark');

    const system = screen.getByRole('radio', { name: 'Match system' });
    system.focus();
    await user.click(system);
    await user.keyboard('{ArrowRight}');
    expect(useSettings.getState().theme).toBe('light');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(useSettings.getState().theme).toBe('high-contrast');

    screen.getByRole('radio', { name: 'Theme default accent' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(useSettings.getState().accent).toBe('#2563eb');
    expect(screen.getByRole('radio', { name: 'Accent #2563eb' })).toBeChecked();
  });

  it('applies the picked layout on Continue, and not on Skip', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Personalize />);
    screen.getByRole('radio', { name: 'Deadline Focus' }).focus();
    await user.keyboard('{ArrowRight}');
    const preset = PRESETS[1];
    expect(screen.getByRole('radio', { name: preset.name })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(useSettings.getState().onboarded).toBe(true);
    const pages = useDashboard.getState().pages;
    expect(pages).toHaveLength(1);
    expect(pages[0].name).toBe('Home');
    expect(pages[0].icon).toBe(preset.icon);
    expect(Object.values(pages[0].widgets).map((w) => w.type)).toEqual(
      preset.widgets.map((w) => w.type),
    );

    unmount();
    useSettings.setState(DEFAULT_SETTINGS);
    const before = useDashboard.getState().pages;
    render(<Personalize />);
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(useSettings.getState().onboarded).toBe(true);
    expect(useDashboard.getState().pages).toBe(before);
  });
});
