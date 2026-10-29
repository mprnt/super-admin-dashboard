'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, Field, Input, Notice, Textarea, cx } from './primitives';
import { messageOf } from '../../lib/client/api';

/**
 * A dialog. On a phone it rises from the bottom as a sheet, within thumb reach and
 * above the home indicator. On a desktop it is a centred card. Escape closes it,
 * focus moves in on open and returns to the trigger on close, and the page behind
 * does not scroll.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  full = false,
  focusField = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  /** A sheet that takes the whole height on a phone, for long lists such as the navigator. */
  full?: boolean;
  /** Move focus into the first field on open. Off for menus, so a phone does not open its keyboard. */
  focusField?: boolean;
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

    const first = focusField ? panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])') : null;
    (first ?? panel.current)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true });
    };
  }, [open, focusField]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(1_30_20/0.45)] backdrop-blur-[2px] md:items-center md:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'safe-bottom flex w-full flex-col bg-surface shadow-sheet outline-none',
          'max-h-[92dvh] rounded-t-2xl border border-line md:max-h-[88vh] md:rounded-xl',
          full ? 'h-[92dvh] md:h-auto' : '',
          wide ? 'md:max-w-3xl' : 'md:max-w-lg',
          'w-full'
        )}
      >
        <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-line md:hidden" />
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 md:py-3.5">
          <h2 id={titleId} className="min-w-0 text-[15px] font-semibold tracking-tight text-ink">
            {title}
          </h2>
          <button
            data-close
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-mute hover:bg-raised hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text md:h-8 md:w-8"
          >
            <span aria-hidden className="text-[15px] leading-none">✕</span>
          </button>
        </header>
        <div className={cx('thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-4', full && 'pb-8')}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Every destructive or security-relevant action goes through here. The operator
 * must type the exact name of the thing being changed, so a tap on the wrong row,
 * or a reflexive Enter, cannot make the change.
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
      <div className="space-y-5">
        <div className="text-[15px] leading-relaxed text-mute">{body}</div>

        {reason && (
          <Field label={reason.label} hint={`At least ${reason.min} characters. It is stored with the audit entry.`}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
        )}

        {requireText && (
          <Field label={`Type ${requireText} to confirm`}>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={typed.length > 0 && !typedOk}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void run();
                }
              }}
            />
          </Field>
        )}

        {error && <Notice tone="bad">{error}</Notice>}

        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2 md:flex md:justify-end">
          <Button onClick={onClose} disabled={busy} data-close className="w-full md:w-auto">
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => void run()} disabled={!ready || busy} className="w-full md:w-auto">
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Shows a secret exactly once: a printer key or a temporary password. The value
 * is kept only in this dialog's state. Closing clears it, and it cannot be closed
 * until the operator confirms they have saved it.
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
      <div className="space-y-5">
        <Notice tone="warn">{note}</Notice>

        <div>
          <div className="mb-2 text-sm font-medium text-ink">{label}</div>
          <code className="block select-all break-all rounded-2xl border border-line bg-bg px-4 py-4 font-mono text-[15px] leading-relaxed text-ink">
            {value ?? ''}
          </code>
          <Button onClick={() => void copy()} aria-label="Copy to clipboard" className="mt-3 w-full">
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <label className="flex min-h-[44px] items-start gap-3 text-[15px] text-ink">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-brand" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>I have saved this somewhere safe. It cannot be shown again.</span>
        </label>

        <Button variant="primary" disabled={!saved} onClick={onClose} className="w-full">
          Done
        </Button>
      </div>
    </Modal>
  );
}
