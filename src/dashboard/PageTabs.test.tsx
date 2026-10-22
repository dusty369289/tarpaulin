import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PAGE_ICONS } from './icons';
import { PageTabs } from './PageTabs';
import { useDashboard } from './store';

// jsdom has no layout or scrolling.
beforeAll(() => {
  Element.prototype.scrollTo ??= () => {};
});

beforeEach(() => {
  useDashboard.setState(useDashboard.getInitialState());
  useDashboard.getState().setEditMode(true);
});

const activePage = () => {
  const { pages, activePageId } = useDashboard.getState();
  return pages.find((p) => p.id === activePageId)!;
};

describe('PageTabs', () => {
  it('picks the page icon from a radio group: one Tab stop, arrow keys pick', async () => {
    const user = userEvent.setup();
    render(<PageTabs />);
    await user.click(screen.getByRole('button', { name: 'Page options' }));
    const group = screen.getByRole('radiogroup', { name: 'Icon' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(Object.keys(PAGE_ICONS).length);
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);

    const keys = Object.keys(PAGE_ICONS);
    const at = keys.indexOf(activePage().icon);
    const current = within(group).getByRole('radio', { checked: true });
    expect(current).toHaveAccessibleName(keys[at].replace(/-/g, ' '));
    current.focus();
    await user.keyboard('{ArrowRight}');
    const next = keys[(at + 1) % keys.length];
    expect(activePage().icon).toBe(next);
    expect(within(group).getByRole('radio', { name: next.replace(/-/g, ' ') })).toHaveFocus();

    await user.click(within(group).getByRole('radio', { name: 'star' }));
    expect(activePage().icon).toBe('star');
  });

  it('moves focus into the rename box, with the name selected', async () => {
    const user = userEvent.setup();
    render(<PageTabs />);
    await user.click(screen.getByRole('button', { name: 'Page options' }));
    await user.click(screen.getByRole('button', { name: /Rename page/ }));
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Page name' });
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    await user.keyboard('Week 1{Enter}');
    expect(activePage().name).toBe('Week 1');
  });
});
