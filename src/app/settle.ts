import type { QueryClient } from '@tanstack/react-query';
import '../dev/labTypes';

// A "settled" signal for automated UI checks, so tests wait exactly as long as the browser needs
// instead of sleeping. Settled = no Canvas queries in flight, no running CSS animations or
// transitions, and no DOM mutations for `quietFrames` consecutive animation frames.

const frame = () => new Promise<number>((r) => requestAnimationFrame(r));

export async function waitForSettled(
  queryClient: QueryClient,
  { quietFrames = 2, timeoutMs = 10_000 } = {},
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  let mutated = true;
  const observer = new MutationObserver(() => {
    mutated = true;
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  try {
    let quiet = 0;
    while (quiet < quietFrames) {
      if (performance.now() > deadline) throw new Error('UI did not settle in time');
      mutated = false;
      await frame();
      const busy =
        mutated ||
        queryClient.isFetching() > 0 ||
        document
          .getAnimations()
          .some(
            (a) =>
              a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity,
          );
      quiet = busy ? 0 : quiet + 1;
    }
  } finally {
    observer.disconnect();
  }
}

export function exposeSettle(queryClient: QueryClient) {
  window.__tarpaulin = {
    ...window.__tarpaulin,
    settled: (opts) => waitForSettled(queryClient, opts),
  };
}
