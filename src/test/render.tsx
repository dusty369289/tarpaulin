import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CanvasProvider } from '../canvas/CanvasProvider';
import { CatalogProvider } from '../canvas/hooks';
import { FixtureTransport, type FixtureBundle, type Transport } from '../canvas/transport';
import fixtures from '../canvas/fixtures/canvas.json';

export const fixtureBundle = fixtures as FixtureBundle;
export const recordedAt = new Date(fixtureBundle.meta.recordedAt);

/** Renders inside the same providers as the app, reading Canvas from recorded fixtures. */
export function renderWithCanvas(
  ui: ReactNode,
  transport: Transport = new FixtureTransport(fixtureBundle),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return {
    transport,
    ...render(
      <QueryClientProvider client={client}>
        <CanvasProvider transport={transport}>
          <CatalogProvider>{ui}</CatalogProvider>
        </CanvasProvider>
      </QueryClientProvider>,
    ),
  };
}
