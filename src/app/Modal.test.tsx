import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { Drawer, Modal } from './Modal';

// jsdom has no layout, so every element counts as visible.
beforeAll(() => {
  Element.prototype.checkVisibility ??= () => true;
});

/** A button that opens a drawer, which has a button that opens a modal on top. */
function Stack() {
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setDrawer(true)}>
        Open drawer
      </button>
      {drawer && (
        <Drawer title="Assignment" label="Assignment: Essay" onClose={() => setDrawer(false)}>
          <button type="button" onClick={() => setModal(true)}>
            Open link
          </button>
          <button type="button">Second</button>
          {modal && (
            <Modal title="Open this link?" onClose={() => setModal(false)}>
              <button type="button">Cancel</button>
              <button type="button" data-autofocus>
                Open in browser
              </button>
            </Modal>
          )}
        </Drawer>
      )}
    </>
  );
}

describe('Modal and Drawer', () => {
  it('move focus in, are modal and take an accessible name', async () => {
    const user = userEvent.setup();
    render(<Stack />);
    await user.click(screen.getByRole('button', { name: 'Open drawer' }));
    const drawer = screen.getByRole('dialog', { name: 'Assignment: Essay' });
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(drawer).toHaveFocus();
  });

  it('keep Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Stack />);
    await user.click(screen.getByRole('button', { name: 'Open drawer' }));
    const drawer = screen.getByRole('dialog', { name: 'Assignment: Essay' });
    for (let i = 0; i < 7; i++) {
      await user.tab();
      expect(drawer).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 7; i++) {
      await user.tab({ shift: true });
      expect(drawer).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('close only the top dialog on Escape, and hand focus back each time', async () => {
    const user = userEvent.setup();
    render(<Stack />);
    const opener = screen.getByRole('button', { name: 'Open drawer' });
    await user.click(opener);
    const link = screen.getByRole('button', { name: 'Open link' });
    await user.click(link);
    const modal = screen.getByRole('dialog', { name: 'Open this link?' });
    // data-autofocus picks the first focus.
    expect(screen.getByRole('button', { name: 'Open in browser' })).toHaveFocus();
    // Tab stays in the top dialog, not the drawer under it.
    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(modal).toContainElement(document.activeElement as HTMLElement);
    }

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Open this link?' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Assignment: Essay' })).toBeInTheDocument();
    expect(link).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('leave Escape to a control inside that handles it itself', async () => {
    const user = userEvent.setup();
    render(
      <Modal title="Search" onClose={() => {}}>
        <input aria-label="q" onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()} />
      </Modal>,
    );
    await user.click(screen.getByLabelText('q'));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
  });

  it('close on a press on the backdrop, not on one inside the panel', () => {
    for (const Dialog of [Modal, Drawer]) {
      let closed = 0;
      const { unmount } = render(
        <Dialog title="Hello" onClose={() => closed++}>
          <p>Body</p>
        </Dialog>,
      );
      const dialog = screen.getByRole('dialog', { name: 'Hello' });
      fireEvent.mouseDown(screen.getByText('Body'));
      fireEvent.mouseDown(dialog);
      expect(closed).toBe(0);
      const backdrop = dialog.parentElement!;
      expect(backdrop).toHaveAttribute('role', 'presentation');
      fireEvent.mouseDown(backdrop);
      expect(closed).toBe(1);
      unmount();
    }
  });

  it('pull focus back in when it lands outside', () => {
    render(
      <>
        <button type="button">Outside</button>
        <Modal title="Hello" onClose={() => {}}>
          <p>Body</p>
        </Modal>
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Hello' });
    act(() => screen.getByRole('button', { name: 'Outside' }).focus());
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });
});
