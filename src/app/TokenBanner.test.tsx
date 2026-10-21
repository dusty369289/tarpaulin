import { useQuery } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CanvasAuthError, type TokenExpiry } from '../canvas/token';
import { FixtureTransport } from '../canvas/transport';
import type { ConnectionInfo } from '../canvas/types';
import { fixtureBundle, renderWithCanvas } from '../test/render';
import { TokenBanner } from './TokenBanner';

const DAY = 86_400_000;

/** Fixtures, but connected with an access token whose health the test picks. */
class TokenTransport extends FixtureTransport {
  constructor(
    private expiry: TokenExpiry,
    private rejected = false,
  ) {
    super(fixtureBundle);
  }
  async status(): Promise<ConnectionInfo> {
    return { ...(await super.status()), method: 'token' };
  }
  async tokenExpiry() {
    if (this.rejected) throw new CanvasAuthError();
    return this.expiry;
  }
  async get(path: string) {
    if (this.rejected) throw new CanvasAuthError('Canvas rejected the credentials (401)');
    return super.get(path);
  }
}

/** Something on the page that reads Canvas, as the widgets do. */
function Reader({ transport }: { transport: FixtureTransport }) {
  useQuery({ queryKey: ['canvas', 'courses'], queryFn: () => transport.get('/api/v1/courses') });
  return null;
}

const inDays = (n: number): TokenExpiry => ({
  status: 'expires',
  expiresAt: new Date(Date.now() + n * DAY).toISOString(),
});

function show(transport: TokenTransport) {
  return renderWithCanvas(
    <>
      <Reader transport={transport} />
      <TokenBanner />
    </>,
    transport,
  );
}

describe('TokenBanner', () => {
  it('shows nothing for a token with no expiry', async () => {
    show(new TokenTransport({ status: 'never' }));
    await waitFor(() => expect(screen.queryByTestId('token-expiry-banner')).toBeNull());
    expect(screen.queryByTestId('token-banner')).toBeNull();
  });

  it('warns ahead of expiry, then again at 3 days after a dismissal', async () => {
    const { unmount } = show(new TokenTransport(inDays(10)));
    const banner = await screen.findByTestId('token-expiry-banner');
    expect(banner).toHaveTextContent('expires in 10 days');
    fireEvent.click(screen.getByRole('button', { name: 'Remind me 3 days before' }));
    expect(screen.queryByTestId('token-expiry-banner')).toBeNull();
    unmount();
    show(new TokenTransport(inDays(2)));
    expect(await screen.findByTestId('token-expiry-banner')).toHaveTextContent('expires in 2 days');
  });

  it('keeps a banner up while Canvas rejects the token, and opens the fixes', async () => {
    show(new TokenTransport({ status: 'never' }, true));
    const banner = await screen.findByTestId('token-banner');
    expect(banner).toHaveTextContent('expired or been revoked');
    expect(banner).not.toHaveTextContent('expires in');
    fireEvent.click(screen.getByRole('button', { name: 'How to get a token' }));
    expect(await screen.findByTestId('token-help')).toHaveTextContent('+ New Access Token');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /Paste a new token/ }));
    expect(await screen.findByTestId('replace-token')).toBeInTheDocument();
  });
});
