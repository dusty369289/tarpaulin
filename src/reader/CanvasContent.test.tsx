import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderWithCanvas } from '../test/render';
import { CanvasContent } from './CanvasContent';

beforeAll(() => {
  Element.prototype.checkVisibility ??= () => true;
});

const HTML =
  '<p>Read <a href="https://example.org/paper">the paper</a>.</p>' +
  '<img src="https://cdn.example.org/a.png" alt="Chart"><img src="https://cdn.example.org/b.png" alt="Map">';

const images = () => [...screen.getByTestId('reader-content').querySelectorAll('img')];

describe('CanvasContent', () => {
  it('loads images from other sites straight away by default', async () => {
    renderWithCanvas(<CanvasContent html={HTML} />);
    await waitFor(() =>
      expect(images().map((i) => i.getAttribute('src'))).toEqual([
        'https://cdn.example.org/a.png',
        'https://cdn.example.org/b.png',
      ]),
    );
    expect(screen.queryByTestId('remote-images-note')).toBeNull();
  });

  it('holds them back when asked to, one click or all at once', async () => {
    const user = userEvent.setup();
    renderWithCanvas(<CanvasContent html={HTML} remoteImages="ask" />);
    const note = await screen.findByTestId('remote-images-note');
    expect(note).toHaveTextContent('2 images from other sites not loaded.');
    expect(images().every((i) => !i.hasAttribute('src'))).toBe(true);

    fireEvent.click(images()[0]);
    expect(images()[0].getAttribute('src')).toBe('https://cdn.example.org/a.png');
    expect(images()[1].hasAttribute('src')).toBe(false);
    expect(note).toHaveTextContent('1 image from other sites not loaded.');

    await user.click(screen.getByRole('button', { name: 'Load images' }));
    expect(images()[1].getAttribute('src')).toBe('https://cdn.example.org/b.png');
    expect(screen.queryByTestId('remote-images-note')).toBeNull();
  });

  it('asks before opening a link outside Canvas; Escape cancels', async () => {
    const user = userEvent.setup();
    renderWithCanvas(<CanvasContent html={HTML} />);
    const link = await screen.findByText('the paper');
    await user.click(link);
    const dialog = screen.getByRole('dialog', { name: 'Open this link?' });
    expect(dialog).toHaveTextContent('https://example.org/paper');
    expect(screen.getByRole('button', { name: 'Open in browser' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
