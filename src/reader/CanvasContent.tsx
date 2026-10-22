import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCanvas } from '../canvas/CanvasProvider';
import * as R from '../canvas/resources';
import { Modal } from '../app/Modal';
import { sanitizeCanvasHtml } from './sanitize';
import './reader.css';

/** Signed file URLs expire after a while; refetch rather than reuse old ones. */
const FILE_URL_TTL = 10 * 60_000;

function loadRemote(img: HTMLImageElement) {
  img.src = img.dataset.remoteSrc!;
  img.dataset.state = 'loaded';
  img.removeAttribute('title');
}

/**
 * Renders Canvas HTML with our own styles (`.reader-prose`). Links open deliberately: Canvas
 * pages through the app's Canvas link handler, other sites only after asking. Canvas file
 * images are fetched with the token as signed URLs. Images from other sites load straight away,
 * or with `remoteImages="ask"` only when clicked (or all at once from the note above them), so
 * those sites don't learn what was read.
 */
export function CanvasContent({
  html,
  remoteImages = 'load',
}: {
  html: string;
  remoteImages?: 'load' | 'ask';
}) {
  const { client, openLink, transport } = useCanvas();
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(0);
  const clean = useMemo(
    () => sanitizeCanvasHtml(html, { baseUrl: client?.baseUrl ?? null }),
    [html, client?.baseUrl],
  );

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const img = (e.target as Element).closest<HTMLImageElement>('img[data-state="blocked"]');
      if (img && root.contains(img)) {
        e.preventDefault();
        loadRemote(img);
        setBlocked(root.querySelectorAll('img[data-state="blocked"]').length);
        return;
      }
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
    if (!root) return;
    const imgs = [...root.querySelectorAll<HTMLImageElement>('img[data-remote-src]')];
    if (remoteImages === 'load') imgs.forEach(loadRemote);
    else
      for (const img of imgs) {
        img.dataset.state = 'blocked';
        img.title = `Image from ${img.dataset.host}. Click to load it.`;
      }
    setBlocked(remoteImages === 'load' ? 0 : imgs.length);
  }, [clean, remoteImages]);

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
      {blocked > 0 && (
        <div
          role="note"
          data-testid="remote-images-note"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted"
        >
          <span>
            {blocked === 1 ? '1 image' : `${blocked} images`} from other sites not loaded.
          </span>
          <button
            type="button"
            className="btn py-1 text-xs"
            onClick={() => {
              ref.current
                ?.querySelectorAll<HTMLImageElement>('img[data-state="blocked"]')
                .forEach(loadRemote);
              setBlocked(0);
            }}
          >
            Load images
          </button>
        </div>
      )}
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
              data-autofocus
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
