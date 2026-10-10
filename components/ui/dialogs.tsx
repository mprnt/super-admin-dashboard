'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Field, Input, Notice, Textarea, cx } from './primitives';
import { messageOf } from '../../lib/client/api';

/**
 * A modal dialog. Escape closes it, focus moves inside on open and returns to
 * the trigger on close, and the page behind it does not scroll.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  // Held in a ref so an inline handler from the parent does not re-run the
  // effect on every render, which would move focus while the operator types.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'flex max-h-[92vh] w-full flex-col rounded-t-lg border border-line bg-surface shadow-2xl sm:rounded-lg',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {title}
          </h2>
          <button data-close type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-mute hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber" aria-label="Close">
            ✕
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * Every destructive or security-relevant action goes through here. The operator
 * must type the exact name of the thing being changed, so a click on the wrong
 * row, or a reflex Enter, cannot make the change.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  requireText,
  reason,
  danger = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** The exact text the operator must type. Omit for a plain confirm. */
  requireText?: string;
  /** A written reason the action must carry, e.g. a refund. */
  reason?: { label: string; min: number };
  danger?: boolean;
  onConfirm: (reason?: string) => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setTyped('');
      setNote('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const typedOk = !requireText || typed === requireText;
  const reasonOk = !reason || note.trim().length >= reason.min;
  const ready = typedOk && reasonOk;

  async function run() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason ? note.trim() : undefined);
      onClose();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={title}>
      <div className="space-y-4">
        <div className="text-sm text-mute">{body}</div>

        {reason && (
          <Field label={reason.label} hint={`At least ${reason.min} characters. Stored with the audit entry.`}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
        )}

        {requireText && (
          <label className="block">
            <span className="mb-1 block text-xs text-mute">
              Type <span className="font-mono text-ink">{requireText}</span> to confirm
            </span>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={typed.length > 0 && !typedOk}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void run();
                }
              }}
            />
          </label>
        )}

        {error && <Notice tone="bad">{error}</Notice>}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button onClick={onClose} disabled={busy} data-close>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => void run()} disabled={!ready || busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Shows a secret exactly once: a printer key or a temporary password. The value
 * is kept only in this dialog's state. Closing it clears the value, and it cannot
 * be closed until the operator confirms they have saved it.
 */
export function SecretDialog({
  open,
  onClose,
  title,
  label,
  value,
  note,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  value: string | null;
  note: string;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setSaved(false);
      setCopied(false);
    }
  }, [open]);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal open={open} onClose={() => saved && onClose()} title={title}>
      <div className="space-y-4">
        <Notice tone="warn">{note}</Notice>

        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-mute">{label}</div>
          <div className="flex items-stretch gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded border border-line bg-bg px-3 py-2.5 font-mono text-sm text-ink">
              {value ?? ''}
            </code>
            <Button onClick={() => void copy()} aria-label="Copy to clipboard">
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-amber"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
          />
          <span>I have saved this value somewhere safe. It cannot be shown again.</span>
        </label>

        <div className="flex justify-end">
          <Button variant="primary" disabled={!saved} onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
