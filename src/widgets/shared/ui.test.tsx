import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CanvasHttpError } from '../../canvas/http';
import { describeError, QueryGate } from './ui';

describe('describeError', () => {
  it('puts a Canvas 5xx in plain words and keeps only what Canvas said', () => {
    const e = new CanvasHttpError(503, '{"errors":[{"message":"Service unavailable"}]}');
    expect(describeError(e)).toMatchObject({
      kind: 'server',
      headline: 'Canvas is having trouble.',
      details: 'HTTP 503 · Service unavailable',
    });
  });

  it('reads the same text when it arrives as a plain Error (the desktop transport)', () => {
    const e = new Error('Canvas returned 500: {"message":"Internal error"}');
    expect(describeError(e).details).toBe('HTTP 500 · Internal error');
  });

  it('never shows a response body it cannot read', () => {
    const e = new Error('Canvas returned 502: <html><body>Bad gateway</body></html>');
    expect(describeError(e).details).toBe('HTTP 502');
  });

  it('knows offline and throttling', () => {
    expect(describeError(new TypeError('Failed to fetch')).headline).toBe('You’re offline.');
    const slow = new Error('Canvas rate limit exceeded (403) after 3 tries');
    expect(describeError(slow).headline).toBe('Canvas asked us to slow down.');
  });

  it('shows local errors as they are', () => {
    expect(describeError(new Error('keychain is locked')).details).toBe('keychain is locked');
  });
});

describe('QueryGate', () => {
  const failed = (refetch = vi.fn()) => ({
    isLoading: false,
    isError: true,
    error: new CanvasHttpError(503, '{"errors":[{"message":"Service unavailable"}]}'),
    refetch,
  });

  it('shows a friendly error with Retry and details on request', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    render(<QueryGate queries={[failed(refetch)]}>{() => 'content'}</QueryGate>);
    expect(screen.getByText('Canvas is having trouble.')).toBeInTheDocument();
    expect(screen.queryByText(/\{"errors"/)).toBeNull();
    expect(screen.queryByText(/HTTP 503/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('HTTP 503 · Service unavailable')).toBeInTheDocument();
  });

  it('keeps showing cached data when a refresh fails', () => {
    render(<QueryGate queries={[{ ...failed(), data: [1] }]}>{() => 'cached content'}</QueryGate>);
    expect(screen.getByText('cached content')).toBeInTheDocument();
  });

  it('says so while retrying', () => {
    render(<QueryGate queries={[{ ...failed(), isFetching: true }]}>{() => null}</QueryGate>);
    expect(screen.getByRole('button', { name: 'Retrying…' })).toBeDisabled();
  });
});
