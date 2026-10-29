'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { Tone } from '../../lib/tree.ts';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Tones for status: always paired with a text label, never colour alone. */
const TONE: Record<Tone, string> = {
  ok: 'border-ok/25 bg-ok/10 text-ok',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  bad: 'border-bad/25 bg-bad/10 text-bad',
  muted: 'border-line bg-raised text-mute',
  amber: 'border-brand-text/20 bg-brand-soft text-brand-text',
};

const DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  muted: 'bg-mute',
  amber: 'bg-brand-text',
};

/** A status badge. The label is always text; the dot only repeats it. */
export function Pill({ tone = 'muted', children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-[3px] text-[11.5px] font-semibold leading-none',
        TONE[tone]
      )}
    >
      {dot && <span aria-hidden className={cx('h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function StatusDot({ tone }: { tone?: Tone }) {
  return <span aria-hidden className={cx('inline-block h-2 w-2 shrink-0 rounded-full', DOT[tone ?? 'muted'])} />;
}

/** A small uppercase label above a group of fields or figures. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-[11px] font-semibold uppercase tracking-[0.1em] text-mute', className)}>{children}</p>;
}

/**
 * A panel: the unit every screen is built from. A white surface with a hairline border;
 * the header, when there is one, is ruled off from the body.
 */
export function Panel({
  title,
  hint,
  actions,
  children,
  className,
  id,
  flush = false,
}: {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  /** No padding around the body, for a table or list that runs edge to edge. */
  flush?: boolean;
}) {
  return (
    <section id={id} className={cx('min-w-0 overflow-hidden rounded-xl border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 md:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h2>}
            {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-mute">{hint}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? '' : 'p-4 md:p-5'}>{children}</div>
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
    <dl className={cx('grid grid-cols-1 gap-x-6', grid)}>
      {items.map((item) => (
        <div key={item.label} className={cx('min-w-0 border-b border-dashed border-line py-2.5', item.wide && 'md:col-span-2')}>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{item.label}</dt>
          <dd className={cx('mt-1 break-words text-[14px] text-ink', item.mono && 'font-mono text-[12.5px]')}>
            {item.value ?? <span className="text-mute">Not set</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const STAT_BAR: Partial<Record<Tone, string>> = { bad: 'bg-bad', warn: 'bg-warn', ok: 'bg-ok' };

/** A headline figure. A coloured edge marks one that needs a look. */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-line bg-surface px-4 py-3.5">
      {tone && STAT_BAR[tone] && <span aria-hidden className={cx('absolute inset-y-0 left-0 w-[3px]', STAT_BAR[tone])} />}
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{label}</div>
      <div
        className={cx(
          'tnum mt-1.5 whitespace-nowrap text-[22px] font-semibold leading-tight tracking-tight md:text-[24px]',
          tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink'
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[12px] leading-snug text-mute">{sub}</div>}
    </div>
  );
}

const BUTTON: Record<'default' | 'primary' | 'danger' | 'ghost', string> = {
  default: 'border border-line-strong bg-surface text-ink hover:bg-raised',
  primary: 'border border-brand bg-brand text-brand-ink hover:brightness-110',
  danger: 'border border-bad/40 bg-surface text-bad hover:bg-bad/10',
  ghost: 'border border-transparent text-brand-text hover:bg-brand-soft',
};

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition select-none disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-text active:translate-y-px';

const BUTTON_SIZE = {
  sm: 'min-h-[40px] px-3 text-[13px] md:min-h-[32px]',
  md: 'min-h-[44px] px-4 text-[13.5px] md:min-h-[38px]',
} as const;

/** A button. At least 40px tall on a phone, the touch target size; compact on a desk. */
export function Button({
  variant = 'default',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; size?: 'sm' | 'md' }) {
  return <button type="button" {...props} className={cx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON[variant], className)} />;
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
    <Link href={href} className={cx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON[variant])}>
      {children}
    </Link>
  );
}

const FIELD =
  'w-full min-h-[44px] rounded-lg border border-line-strong bg-surface px-3 py-2 text-ink placeholder:text-mute/70 transition focus:border-brand-text focus:outline-none focus:ring-2 focus:ring-brand-text/20 disabled:opacity-50 md:min-h-[38px]';

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[12.5px] font-semibold text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-[12px] leading-snug text-mute">{hint}</span>}
      {error && <span className="mt-1.5 block text-[12px] font-medium text-bad">{error}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(FIELD, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(FIELD, 'appearance-none bg-[length:14px] bg-[right_0.75rem_center] bg-no-repeat pr-9', props.className)}
      style={{ backgroundImage: CHEVRON, ...props.style }}
    />
  );
}

/** A small down-chevron for selects, drawn in the mute colour so it reads in both themes. */
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%235A6960' stroke-width='1.8'%3E%3Cpath d='M5 8l5 5 5-5'/%3E%3C/svg%3E\")";

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(FIELD, 'min-h-[96px]', props.className)} />;
}

const NOTICE = {
  warn: 'border-warn bg-warn/10 text-warn',
  bad: 'border-bad bg-bad/10 text-bad',
  ok: 'border-ok bg-ok/10 text-ok',
  info: 'border-info bg-info/10 text-info',
} as const;

/** A message in the flow of the page, marked by a coloured left edge. */
export function Notice({ tone = 'warn', children }: { tone?: keyof typeof NOTICE; children: ReactNode }) {
  return (
    <div role={tone === 'bad' ? 'alert' : 'note'} className={cx('rounded-lg border-l-[3px] px-4 py-2.5 text-[13px] leading-relaxed', NOTICE[tone])}>
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-5 py-8 text-center">
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 text-[13px] text-mute">{children}</p>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="space-y-2.5 py-3">
      <p className="text-[13px] text-mute">{label}…</p>
      <div className="h-3 w-2/3 animate-pulse rounded bg-raised" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-raised" />
      <div className="h-3 w-3/5 animate-pulse rounded bg-raised" />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-l-[3px] border-bad bg-bad/10 px-4 py-2.5 text-[13px] text-bad">
      <span className="min-w-0 flex-1">{error}</span>
      {onRetry && (
        <Button size="sm" variant="danger" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Sub-navigation within one partner: an underlined row that scrolls on a phone. */
export function Tabs({ items }: { items: { href: string; label: string; active: boolean; count?: number | null }[] }) {
  return (
    <nav aria-label="Sections" className="no-scrollbar -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <div className="flex w-max gap-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={cx(
              'relative inline-flex h-11 items-center gap-1.5 whitespace-nowrap px-3 text-[13.5px] font-medium transition',
              item.active ? 'text-ink' : 'text-mute hover:text-ink'
            )}
          >
            {item.label}
            {item.count !== undefined && item.count !== null && (
              <span className={cx('tnum rounded px-1.5 text-[11px] font-semibold', item.active ? 'bg-brand text-brand-ink' : 'bg-raised text-mute')}>
                {item.count}
              </span>
            )}
            {item.active && <span aria-hidden className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-brand-text" />}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12.5px]">{children}</span>;
}

/** A small set of mutually exclusive choices, such as a reporting period. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-raised p-0.5 no-scrollbar">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-[36px] whitespace-nowrap rounded-md px-3 text-[12.5px] font-semibold transition md:min-h-[30px]',
              on ? 'bg-surface text-ink shadow-sm' : 'text-mute hover:text-ink'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
