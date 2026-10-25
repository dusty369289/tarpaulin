import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Notes } from './Notes';
import { defaultSettings } from './registry';
import type { WidgetProps } from './types';

type Settings = WidgetProps<ReturnType<typeof Notes.settingsSchema.parse>>['settings'];
const settings = defaultSettings('notes') as Settings;

function renderNotes() {
  const setData = vi.fn();
  const Component = Notes.Component;
  const view = render(
    <Component
      id="n1"
      settings={settings}
      size={{ w: 4, h: 6 }}
      editMode={false}
      data={{ text: '' }}
      setData={setData}
    />,
  );
  return { setData, view };
}

describe('Notes', () => {
  it('writes the last keystrokes when it unmounts inside the debounce', () => {
    const { setData, view } = renderNotes();
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'half a thought' },
    });
    expect(setData).not.toHaveBeenCalled();
    view.unmount();
    expect(setData).toHaveBeenLastCalledWith({ text: 'half a thought' });
  });

  it('writes them when the window goes away', () => {
    const { setData } = renderNotes();
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: 'quit from the tray' },
    });
    window.dispatchEvent(new Event('pagehide'));
    expect(setData).toHaveBeenLastCalledWith({ text: 'quit from the tray' });
  });

  it('writes nothing extra when nothing changed', () => {
    const { setData, view } = renderNotes();
    view.unmount();
    expect(setData).not.toHaveBeenCalled();
  });
});

describe('Notes formatting', () => {
  it('shows the note formatted once you click away from the editor', () => {
    renderNotes();
    const box = screen.getByRole('textbox', { name: 'Note' });
    fireEvent.change(box, { target: { value: '# Week plan\n**read** chapter 4' } });
    fireEvent.blur(box);
    expect(screen.queryByRole('textbox', { name: 'Note' })).toBeNull();
    expect(screen.getByText('Week plan')).toHaveClass('font-semibold');
    expect(screen.getByText('read').tagName).toBe('STRONG');
  });

  it('stays in the editor when the note is empty', () => {
    renderNotes();
    fireEvent.blur(screen.getByRole('textbox', { name: 'Note' }));
    expect(screen.getByRole('textbox', { name: 'Note' })).toBeInTheDocument();
  });
});
