import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Radio, RadioGroup } from './RadioGroup';

const OPTIONS = ['red', 'green', 'blue'];

function Colours({ initial, onChange }: { initial: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <button type="button">Before</button>
      <RadioGroup
        label="Colour"
        value={value}
        options={OPTIONS}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      >
        {OPTIONS.map((o) => (
          <Radio key={o} value={o} label={o}>
            {o}
          </Radio>
        ))}
      </RadioGroup>
      <button type="button">After</button>
    </>
  );
}

describe('RadioGroup', () => {
  it('is one Tab stop, on the checked option', async () => {
    const user = userEvent.setup();
    render(<Colours initial="green" />);
    screen.getByRole('button', { name: 'Before' }).focus();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'green' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('puts the Tab stop on the first option when none is checked', async () => {
    const user = userEvent.setup();
    render(<Colours initial="" />);
    screen.getByRole('button', { name: 'Before' }).focus();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'red' })).toHaveFocus();
    expect(
      screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false'),
    ).toBe(true);
  });

  it('moves and picks with the arrow keys, wrapping, and Home/End', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Colours initial="red" onChange={onChange} />);
    screen.getByRole('radio', { name: 'red' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'green' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'green' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'red' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { name: 'blue' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'red' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'blue' })).toHaveAttribute('aria-checked', 'true');
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([
      'green',
      'blue',
      'red',
      'blue',
      'red',
      'blue',
    ]);
    expect(screen.getByRole('radiogroup', { name: 'Colour' })).toBeInTheDocument();
  });

  it('picks on click and Space', async () => {
    const user = userEvent.setup();
    render(<Colours initial="red" />);
    await user.click(screen.getByRole('radio', { name: 'blue' }));
    expect(screen.getByRole('radio', { name: 'blue' })).toHaveAttribute('aria-checked', 'true');
    screen.getByRole('radio', { name: 'blue' }).blur();
    screen.getByRole('radio', { name: 'green' }).focus();
    await user.keyboard(' ');
    expect(screen.getByRole('radio', { name: 'green' })).toHaveAttribute('aria-checked', 'true');
  });
});
