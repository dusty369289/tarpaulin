import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { useConfirm } from './ConfirmDialog';

beforeAll(() => {
  Element.prototype.checkVisibility ??= () => true;
});

function Asker() {
  const [dialog, confirm] = useConfirm();
  const [answer, setAnswer] = useState('');
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const choice = await confirm({
            title: 'Import dashboard',
            message: 'Replace your pages, or add these alongside?',
            actions: [
              { value: 'replace', label: 'Replace my pages', tone: 'danger' },
              { value: 'append', label: 'Add alongside' },
            ],
          });
          setAnswer(String(choice));
        }}
      >
        Import
      </button>
      <output>{answer}</output>
      {dialog}
    </>
  );
}

describe('useConfirm', () => {
  it('asks with explicit answers, starting on Cancel', async () => {
    const user = userEvent.setup();
    render(<Asker />);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Import dashboard' });
    expect(dialog).toHaveAccessibleDescription('Replace your pages, or add these alongside?');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Add alongside' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('append');
    expect(screen.getByRole('button', { name: 'Import' })).toHaveFocus();
  });

  it('resolves null for Cancel, Escape and the close button', async () => {
    const user = userEvent.setup();
    render(<Asker />);
    for (const dismiss of [
      () => user.click(screen.getByRole('button', { name: 'Cancel' })),
      () => user.keyboard('{Escape}'),
      () => user.click(screen.getByRole('button', { name: 'Close' })),
    ]) {
      await user.click(screen.getByRole('button', { name: 'Import' }));
      await user.click(screen.getByRole('button', { name: 'Replace my pages' }));
      expect(screen.getByRole('status')).toHaveTextContent('replace');
      await user.click(screen.getByRole('button', { name: 'Import' }));
      await dismiss();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('null');
    }
  });
});
