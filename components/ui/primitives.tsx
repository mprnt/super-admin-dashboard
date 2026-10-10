'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { Tone } from '../../lib/tree.ts';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Tones for status: always paired with a text label, never colour alone. */
const TONE: Record<Tone, string> = {
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/12 text-warn',
  bad: 'bg-bad/10 text-bad',
  muted: 'bg-raised text-mute',
  amber: 'bg-brand-soft text-brand-text',
};

const DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  muted: 'bg-mute',
  amber: 'bg-brand-text',
};

/** A status chip. The label is always text. */
export function Pill({ tone = 'muted', children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx('inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', TONE[tone])}>
      {dot && <span aria-hidden className={cx('h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function StatusDot({ tone }: { tone?: Tone }) {
  return <span aria-hidden className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', DOT[tone ?? 'muted'])} />;
}

/** A card: the main unit of every screen. Rounded, on the surface colour. */
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
    <section id={id} className={cx('min-w-0 rounded-3xl bg-surface shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pb-1 pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>}
            {hint && <p className="mt-0.5 text-sm leading-snug text-mute">{hint}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Every field the record has, as label and value. Stacks on a phone, two columns on a desk. */
export function KV({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode; mono?: boolean; wide?: boolean }[];
  columns?: 1 | 2 | 3;
}) {
  const grid = columns === 3 ? 'md:grid-cols-3' : columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1';
  return (
    <dl className={cx('grid grid-cols-1 gap-x-8 gap-y-0', grid)}>
      {items.map((item) => (
        <div key={item.label} className={cx('min-w-0 border-b border-line py-3 last:border-b-0', item.wide && 'md:col-span-2')}>
          <dt className="text-xs font-medium text-mute">{item.label}</dt>
          <dd className={cx('mt-1 break-words text-[15px] text-ink', item.mono && 'font-mono text-[13px]')}>
            {item.value ?? <span className="text-mute">Not set</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A headline number: big, quiet, and never shouting. */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0 rounded-3xl bg-surface p-4 shadow-card md:p-5">
      <div className="text-xs font-medium text-mute">{label}</div>
      <div
        className={cx(
          'mt-1.5 break-words text-2xl font-semibold tracking-tight tabular-nums md:text-[28px]',
          tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink'
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs leading-snug text-mute">{sub}</div>}
    </div>
  );
}

const BUTTON: Record<'default' | 'primary' | 'danger' | 'ghost', string> = {
  default: 'border border-line bg-surface text-ink hover:bg-raised',
  primary: 'bg-brand text-brand-ink hover:brightness-110',
  danger: 'border border-bad/50 bg-surface text-bad hover:bg-bad/10',
  ghost: 'text-brand-text hover:bg-brand-soft',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition select-none disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text active:scale-[0.98]';

/** A pill button. Every size is at least 44px tall on a phone, the touch target size. */
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
      className={cx(BUTTON_BASE, size === 'sm' ? 'min-h-[44px] px-4 text-sm md:min-h-[40px]' : 'min-h-[48px] px-6 text-[15px]', BUTTON[variant], className)}
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
      className={cx(BUTTON_BASE, size === 'sm' ? 'min-h-[44px] px-4 text-sm md:min-h-[40px]' : 'min-h-[48px] px-6 text-[15px]', BUTTON[variant])}
    >
      {children}
    </Link>
  );
}

const FIELD =
  'w-full min-h-[48px] rounded-2xl border border-line bg-bg px-4 py-2.5 text-ink placeholder:text-mute/70 transition focus:border-brand-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/40 disabled:opacity-50';

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs leading-snug text-mute">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs text-bad">{error}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(FIELD, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(FIELD, 'appearance-none bg-[length:14px] bg-[right_1rem_center] bg-no-repeat pr-10', props.className)} style={{ backgroundImage: CHEVRON, ...props.style }} />;
}

/** A small down-chevron for selects, drawn in the mute colour so it reads in both themes. */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%235C6961' stroke-width='1.8'%3E%3Cpath d='M5 8l5 5 5-5'/%3E%3C/svg%3E\")";

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(FIELD, 'min-h-[96px]', props.className)} />;
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'ok' | 'info'; children: ReactNode }) {
  const map = {
    warn: 'bg-warn/10 text-warn',
    bad: 'bg-bad/10 text-bad',
    ok: 'bg-ok/10 text-ok',
    info: 'bg-info/10 text-info',
  } as const;
  return <div role={tone === 'bad' ? 'alert' : 'note'} className={cx('rounded-2xl px-4 py-3 text-sm leading-relaxed', map[tone])}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-raised px-5 py-8 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {children && <p className="mt-1 text-sm text-mute">{children}</p>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="space-y-3 py-4">
      <p className="text-sm text-mute">{label}…</p>
      <div className="h-4 w-2/3 animate-pulse rounded-full bg-raised" />
      <div className="h-4 w-1/2 animate-pulse rounded-full bg-raised" />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad">
      <span className="min-w-0 flex-1">{error}</span>
      {onRetry && (
        <Button size="sm" variant="danger" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Sub-navigation within one partner. A scrolling row of pills on a phone. */
export function Tabs({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav aria-label="Sections" className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <div className="flex w-max gap-2 py-1 md:w-auto md:flex-wrap">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cx(
              'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition',
              item.active ? 'bg-brand text-brand-ink' : 'bg-surface text-ink shadow-card hover:bg-raised'
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[13px]">{children}</span>;
}
