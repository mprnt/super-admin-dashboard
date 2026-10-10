'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { Tone } from '../../lib/tree.ts';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const TONE: Record<Tone, string> = {
  ok: 'text-ok border-ok/40 bg-ok/10',
  warn: 'text-warn border-warn/40 bg-warn/10',
  bad: 'text-bad border-bad/40 bg-bad/10',
  muted: 'text-mute border-line bg-raised',
  amber: 'text-amber border-amber/40 bg-amber/10',
};

const DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  muted: 'bg-mute',
  amber: 'bg-amber',
};

/** A status chip. The label is always text, so status is never colour alone. */
export function Pill({ tone = 'muted', children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide',
        TONE[tone]
      )}
    >
      {dot && <span aria-hidden className={cx('h-1.5 w-1.5 rounded-full', DOT[tone])} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone }: { tone?: Tone }) {
  return <span aria-hidden className={cx('inline-block h-2 w-2 shrink-0 rounded-full', DOT[tone ?? 'muted'])} />;
}

/** A bordered region with a title row. The main unit of every page. */
export function Panel({
  title,
  hint,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx('rounded-md border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs text-mute">{hint}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * Every field the record has, as label / value pairs. Used so that a detail page
 * shows the whole record, not a summary of it.
 */
export function KV({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode; mono?: boolean; wide?: boolean }[];
  columns?: 1 | 2 | 3;
}) {
  const grid = columns === 3 ? 'md:grid-cols-3' : columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1';
  return (
    <dl className={cx('grid grid-cols-1 gap-x-6 gap-y-3', grid)}>
      {items.map((item) => (
        <div key={item.label} className={cx('min-w-0 border-b border-line/60 pb-2', item.wide && 'md:col-span-2')}>
          <dt className="text-[11px] uppercase tracking-wider text-mute">{item.label}</dt>
          <dd className={cx('mt-0.5 break-words text-sm text-ink', item.mono && 'font-mono text-[13px]')}>
            {item.value ?? <span className="text-mute">—</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-mute">{label}</div>
      <div className={cx('mt-1 font-mono text-xl font-semibold tabular-nums', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink')}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}
    </div>
  );
}

const BUTTON: Record<'default' | 'primary' | 'danger' | 'ghost', string> = {
  default: 'border-line bg-raised text-ink hover:border-mute',
  primary: 'border-amber/60 bg-amber text-[#111] hover:brightness-110',
  danger: 'border-bad/60 bg-bad/15 text-bad hover:bg-bad/25',
  ghost: 'border-transparent bg-transparent text-mute hover:text-ink',
};

export function Button({
  variant = 'default',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded border font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber',
        size === 'sm' ? 'min-h-[32px] px-2.5 text-xs' : 'min-h-[38px] px-3 text-sm',
        BUTTON[variant],
        className
      )}
    />
  );
}

export function LinkButton({
  href,
  children,
  variant = 'default',
  size = 'md',
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof BUTTON;
  size?: 'sm' | 'md';
}) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded border font-medium transition',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber',
        size === 'sm' ? 'min-h-[32px] px-2.5 text-xs' : 'min-h-[38px] px-3 text-sm',
        BUTTON[variant]
      )}
    >
      {children}
    </Link>
  );
}

const FIELD =
  'w-full rounded border border-line bg-bg px-2.5 py-2 text-sm text-ink placeholder:text-mute/70 focus:border-amber focus:outline-none focus-visible:ring-2 focus-visible:ring-amber/40 disabled:opacity-50';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-mute">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-mute">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-bad">{error}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(FIELD, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(FIELD, 'pr-8', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(FIELD, 'min-h-[84px]', props.className)} />;
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'ok' | 'info'; children: ReactNode }) {
  const map = {
    warn: 'border-warn/40 bg-warn/10 text-warn',
    bad: 'border-bad/40 bg-bad/10 text-bad',
    ok: 'border-ok/40 bg-ok/10 text-ok',
    info: 'border-info/40 bg-info/10 text-info',
  } as const;
  return <div role={tone === 'bad' ? 'alert' : 'note'} className={cx('rounded border px-3 py-2 text-sm', map[tone])}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line px-4 py-8 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <p className="mt-1 text-xs text-mute">{children}</p>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-6 text-sm text-mute">
      <span aria-hidden className="h-3 w-3 animate-pulse rounded-full bg-amber" />
      {label}…
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded border border-bad/40 bg-bad/10 px-3 py-2.5 text-sm text-bad">
      <span>{error}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** Sub-navigation within one entity. Horizontal, and scrolls on a phone. */
export function Tabs({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav aria-label="Sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cx(
            'whitespace-nowrap border-b-2 px-3 py-2 text-sm transition',
            item.active ? 'border-amber text-ink' : 'border-transparent text-mute hover:text-ink'
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[13px]">{children}</span>;
}
