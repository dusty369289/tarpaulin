import { fireEvent, render, screen } from '@testing-library/react';
import { StickyNote } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { frameSchema } from './frame';
import { WidgetFrame } from './WidgetFrame';

const frame = frameSchema.parse({});

describe('WidgetFrame in edit mode', () => {
  it('moves with the arrow keys and resizes with Shift from its grip', () => {
    const onNudge = vi.fn();
    render(
      <WidgetFrame
        widgetId="w"
        title="Notes"
        icon={StickyNote}
        frame={frame}
        editMode
        onNudge={onNudge}
        onRemove={() => {}}
      >
        body
      </WidgetFrame>,
    );
    const grip = screen.getByRole('button', { name: 'Move Notes' });
    expect(grip).toHaveAccessibleDescription(/Arrow keys move it, Shift/);
    fireEvent.keyDown(grip, { key: 'ArrowRight' });
    fireEvent.keyDown(grip, { key: 'ArrowUp' });
    fireEvent.keyDown(grip, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(grip, { key: 'ArrowLeft', shiftKey: true });
    fireEvent.keyDown(grip, { key: 'Enter' });
    expect(onNudge.mock.calls.map(([n]) => n)).toEqual([
      { dx: 1 },
      { dy: -1 },
      { dh: 1 },
      { dw: -1 },
    ]);
    expect(screen.getByRole('button', { name: 'Remove Notes' })).toBeInTheDocument();
  });

  it('shows a plain grip where the layout is fixed, and no grip outside edit mode', () => {
    const { rerender } = render(
      <WidgetFrame widgetId="w" title="Notes" icon={StickyNote} frame={frame} editMode>
        body
      </WidgetFrame>,
    );
    expect(screen.queryByRole('button', { name: 'Move Notes' })).toBeNull();
    rerender(
      <WidgetFrame widgetId="w" title="Notes" icon={StickyNote} frame={frame} editMode={false}>
        body
      </WidgetFrame>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
