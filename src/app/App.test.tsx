import { useQuery } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvas } from '../canvas/CanvasProvider';
import { CanvasHttpError } from '../canvas/http';
import { readSavedConnection, saveConnection, savedConnectionKey } from '../canvas/savedConnection';
import { CanvasAuthError } from '../canvas/token';
import { FixtureTransport, type Transport } from '../canvas/transport';
import type { ConnectionInfo } from '../canvas/types';
import { fixtureBundle, renderWithCanvas } from '../test/render';
import { App } from './App';
import { useSettings } from './settingsStore';

// The dashboard itself is tested elsewhere; here it only has to show it rendered, with what.
vi.mock('../dashboard/Dashboard', () => ({
  Dashboard: () => {
    const { connection, client, transport } = useCanvas();
    // A widget's query, so the test sees the cached data being asked again.
    useQuery({
      queryKey: ['canvas', client?.baseUrl, 'courses'],
      queryFn: () => transport.get('/api/v1/courses'),
      enabled: Boolean(client),
    });
    return (
      <div data-testid="dashboard">
        {connection?.userName} @ {client?.baseUrl}
      </div>
    );
  },
}));
vi.mock('../notifications/useNotifications', () => ({ NotificationRunner: () => null }));
// Background re-checks after `retry.ms` rather than 15 s and up.
const retry = vi.hoisted(() => ({ ms: 50 }));
vi.mock('../canvas/savedConnection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../canvas/savedConnection')>()),
  retryDelay: () => retry.ms,
}));

const SAVED: ConnectionInfo = {
  connected: true,
  baseUrl: 'https://canvas.example.edu',
  method: 'fixtures',
  userName: 'Saved Student',
};
const KEY = savedConnectionKey('fixtures');

/** Fixtures whose connection check fails (or answers) the way each test says. */
class CheckTransport extends FixtureTransport {
  failWith: unknown = null;
  answer: ConnectionInfo | null = null;
  checks = 0;
  disconnected = false;
  constructor() {
    super(fixtureBundle);
    // Fixtures can't disconnect; this one can.
    (this as Transport).disconnect = async () => {
      this.disconnected = true;
    };
  }
  async status(): Promise<ConnectionInfo> {
    this.checks++;
    if (this.failWith) throw this.failWith;
    if (this.disconnected) return { connected: false, baseUrl: null, method: null, userName: null };
    return this.answer ?? super.status();
  }
}

const offline = () => new TypeError('Failed to fetch');
const later = { timeout: 4000 };

beforeEach(() => {
  retry.ms = 50;
  useSettings.setState({ onboarded: true });
});

describe('App when the connection check fails', () => {
  it('opens the cached dashboard with the saved connection', async () => {
    retry.ms = 60_000; // only the Retry button checks again here
    saveConnection('fixtures', SAVED);
    const transport = new CheckTransport();
    transport.failWith = offline();
    const get = vi.spyOn(transport, 'get');
    renderWithCanvas(<App />, transport);

    expect(await screen.findByTestId('dashboard', {}, later)).toHaveTextContent(
      'Saved Student @ https://canvas.example.edu',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    // It says so, with a Retry of its own…
    expect(screen.getByTestId('saved-connection')).toHaveTextContent(/saved data/);
    // …and the cached Canvas data is asked again, which is what drives the bar's chip.
    await waitFor(() => expect(get).toHaveBeenCalled());

    // Canvas comes back: Retry checks again and the live connection takes over.
    transport.failWith = null;
    transport.answer = { ...SAVED, userName: 'Live Student' };
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('dashboard')).toHaveTextContent('Live Student'));
    expect(screen.queryByTestId('saved-connection')).toBeNull();
    expect(readSavedConnection('fixtures')?.userName).toBe('Live Student');
  });

  it('retries in the background while on the saved copy', async () => {
    saveConnection('fixtures', SAVED);
    const transport = new CheckTransport();
    transport.failWith = new CanvasHttpError(503, 'Service Unavailable');
    renderWithCanvas(<App />, transport);
    await screen.findByTestId('dashboard', {}, later);
    const before = transport.checks;
    await waitFor(() => expect(transport.checks).toBeGreaterThan(before + 1), later);
    // Still failing: still on the saved copy.
    expect(screen.getByTestId('saved-connection')).toBeInTheDocument();
    transport.failWith = null;
    transport.answer = SAVED;
    await waitFor(() => expect(screen.queryByTestId('saved-connection')).toBeNull(), later);
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });

  it('a rejected token still blocks, and forgets the saved copy', async () => {
    saveConnection('fixtures', SAVED);
    const transport = new CheckTransport();
    transport.failWith = new CanvasAuthError();
    renderWithCanvas(<App />, transport);

    expect(await screen.findByRole('alert', {}, later)).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('an unreadable keychain still blocks', async () => {
    saveConnection('fixtures', SAVED);
    const transport = new CheckTransport();
    transport.failWith = 'keychain error: the keychain is locked';
    renderWithCanvas(<App />, transport);

    expect(await screen.findByRole('button', { name: 'Retry' }, later)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/keychain/i);
    expect(screen.queryByTestId('dashboard')).toBeNull();
  });

  it('shows the Retry card when nothing was saved', async () => {
    const transport = new CheckTransport();
    transport.failWith = offline();
    renderWithCanvas(<App />, transport);

    expect(await screen.findByRole('alert', {}, later)).toHaveTextContent(/offline/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).toBeNull();
  });

  it('ignores a saved copy of the wrong shape', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: 1, savedAt: Date.now(), info: { ...SAVED, baseUrl: 'javascript:x' } }),
    );
    const transport = new CheckTransport();
    transport.failWith = offline();
    renderWithCanvas(<App />, transport);

    expect(await screen.findByRole('alert', {}, later)).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('App and the saved connection across accounts', () => {
  it('saves each check that works, replacing another account’s copy', async () => {
    saveConnection('fixtures', { ...SAVED, baseUrl: 'https://old.example.org', userName: 'Old' });
    const transport = new CheckTransport();
    transport.answer = SAVED;
    renderWithCanvas(<App />, transport);
    await screen.findByTestId('dashboard', {}, later);
    expect(readSavedConnection('fixtures')).toEqual(SAVED);
  });

  it('forgets it on disconnect, so a failing check afterwards shows no one’s data', async () => {
    const transport = new CheckTransport();
    transport.answer = SAVED;
    let canvas: ReturnType<typeof useCanvas> | null = null;
    function Grab() {
      canvas = useCanvas();
      return null;
    }
    renderWithCanvas(
      <>
        <Grab />
        <App />
      </>,
      transport,
    );
    await screen.findByTestId('dashboard', {}, later);
    expect(readSavedConnection('fixtures')).not.toBeNull();

    // Disconnect, then the next check can't reach anything.
    transport.failWith = offline();
    await act(async () => {
      await canvas!.transport.disconnect();
      await canvas!.refreshConnection();
    });
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(await screen.findByRole('alert', {}, later)).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).toBeNull();
  });

  it('forgets it when a new account connects', async () => {
    saveConnection('fixtures', SAVED);
    const transport = new CheckTransport();
    (transport as Transport).connectWithToken = async () => ({
      ...SAVED,
      baseUrl: 'https://new.example.org',
    });
    transport.answer = SAVED;
    let canvas: ReturnType<typeof useCanvas> | null = null;
    function Grab() {
      canvas = useCanvas();
      return null;
    }
    renderWithCanvas(<Grab />, transport);
    await waitFor(() => expect(canvas?.connection).toBeDefined());
    await act(async () => {
      await canvas!.transport.connectWithToken('https://new.example.org', 'not-a-real-token');
    });
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
