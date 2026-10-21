import { useCallback, useId, useState, type ReactNode } from 'react';
import { Modal } from '../app/Modal';

export interface ConfirmAction<T extends string> {
  value: T;
  label: string;
  /** 'danger' for the choice that throws something away. */
  tone?: 'primary' | 'danger' | 'plain';
}

export interface ConfirmOptions<T extends string> {
  title: string;
  message: ReactNode;
  /** The answers, left to right after Cancel. The last one is the main one. */
  actions: ConfirmAction<T>[];
  cancelLabel?: string;
}

const TONE = {
  primary: 'btn btn-primary',
  // Outlined: a solid red fill can't carry readable text in every theme.
  danger: 'btn border-danger text-danger hover:bg-danger/10',
  plain: 'btn',
};

/**
 * A question with explicit answers, in place of the browser's confirm(): every choice is a
 * labelled button, and Cancel (or Escape, or the close button) always means "do nothing".
 * Focus starts on Cancel, so a stray Enter never throws anything away.
 */
export function ConfirmDialog<T extends string>({
  title,
  message,
  actions,
  cancelLabel = 'Cancel',
  onChoose,
}: ConfirmOptions<T> & { onChoose: (value: T | null) => void }) {
  const id = useId();
  return (
    <Modal title={title} role="alertdialog" describedBy={id} onClose={() => onChoose(null)}>
      <div id={id} className="text-sm" data-testid="confirm-message">
        {message}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          data-autofocus
          onClick={() => onChoose(null)}
        >
          {cancelLabel}
        </button>
        {actions.map((a, i) => (
          <button
            key={a.value}
            type="button"
            className={TONE[a.tone ?? (i === actions.length - 1 ? 'primary' : 'plain')]}
            onClick={() => onChoose(a.value)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

type Pending = ConfirmOptions<string> & { resolve: (value: string | null) => void };

/**
 * `const [dialog, confirm] = useConfirm()`: render `dialog`, then
 * `await confirm({ title, message, actions })` resolves to the chosen value, or null for Cancel.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback(
    <T extends string>(options: ConfirmOptions<T>) =>
      new Promise<T | null>((resolve) =>
        setPending({ ...options, resolve: resolve as (value: string | null) => void }),
      ),
    [],
  );
  const dialog = pending && (
    <ConfirmDialog
      {...pending}
      onChoose={(value) => {
        setPending(null);
        pending.resolve(value);
      }}
    />
  );
  return [dialog, confirm] as const;
}
