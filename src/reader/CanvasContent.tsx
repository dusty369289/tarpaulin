import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvas } from '../canvas/CanvasProvider';
import * as R from '../canvas/resources';
import { Modal } from '../app/Modal';
import { sanitizeCanvasHtml } from './sanitize';

/** Signed file URLs expire after a while; refetch rather than reuse old ones. */
const FILE_URL_TTL = 10 * 60_000;

/**
 * Renders Canvas HTML with our own styles (`.reader-prose`). Links open deliberately: Canvas
 * pages through the app's Canvas link handler, other sites only after asking. Canvas file
 * images are fetched with the token as signed URLs.
 */
export function CanvasContent({ html }: { html: string }) {
  const { client, openLink, transport } = useCanvas();
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const clean = useMemo(
    () => sanitizeCanvasHtml(html, { baseUrl: client?.baseUrl ?? null }),
    [html, client?.baseUrl],
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest('a');
      if (!a || !root.contains(a)) return;
      e.preventDefault();
      const href = a.dataset.href;
      if (!href) return;
      if (a.dataset.canvas === 'true') openLink(href);
      else setConfirm(href);
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [openLink]);

  useEffect(() => {
    const root = ref.current;
    if (!root || !client) return;
    let cancelled = false;
    for (const img of root.querySelectorAll<HTMLImageElement>('img[data-file-id]')) {
      const id = img.dataset.fileId!;
      img.dataset.state = 'loading';
      queryClient
        .fetchQuery({
          queryKey: ['canvas', client.baseUrl, ...R.FileUrl(id).key],
          queryFn: () => client.fetch(R.FileUrl(id)),
          staleTime: FILE_URL_TTL,
          gcTime: FILE_URL_TTL,
        })
        .then((file) => {
          if (cancelled) return;
          if (file.url && /^(https?:|data:image\/)/.test(file.url)) {
            img.src = file.url;
            img.dataset.state = 'loaded';
          } else img.dataset.state = 'failed';
        })
        .catch(() => {
          if (!cancelled) img.dataset.state = 'failed';
        });
    }
    return () => {
      cancelled = true;
    };
  }, [clean, client, queryClient]);

  return (
    <>
      <div
        ref={ref}
        className="reader-prose"
        data-testid="reader-content"
        // Sanitised above: see src/reader/sanitize.ts.
        dangerouslySetInnerHTML={{ __html: clean }}
      />
      {confirm && (
        <Modal title="Open this link?" onClose={() => setConfirm(null)}>
          <p className="text-sm">This link goes outside Canvas, to:</p>
          <p className="mt-2 break-all rounded-md bg-surface-2 p-2 font-mono text-xs">{confirm}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void transport.openWebLink(confirm).catch(() => {});
                setConfirm(null);
              }}
            >
              Open in browser
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
