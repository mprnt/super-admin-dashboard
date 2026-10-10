'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx, Empty } from './primitives';

// ---------------------------------------------------------------------------
// Lists: a table on a desktop, a stack of cards on a phone. Both show every field.
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
  /** Pixels; keeps a column from collapsing so the table scrolls instead. */
  minWidth?: number;
  /** Left off the phone card. The row's detail page still has it. */
  hideMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  rowHref,
  onRowClick,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: ReactNode;
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  caption: string;
}) {
  if (rows.length === 0) return <Empty title={typeof empty === 'string' ? empty : 'Nothing here yet'} />;

  const [first, ...rest] = columns;
  const mobileRest = rest.filter((c) => !c.hideMobile);

  return (
    <>
      {/* Phone: each row is a card. The whole card is the tap target when it links or opens. */}
      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const href = rowHref?.(row);
          const body = (
            <>
              {first && (
                <div className="min-w-0 text-[15px] font-semibold text-ink">
                  {first.cell(row)}
                </div>
              )}
              {mobileRest.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  {mobileRest.map((c) => (
                    <div key={c.key} className={cx('min-w-0', mobileRest.length % 2 === 1 && c === mobileRest[mobileRest.length - 1] && 'col-span-2')}>
                      <dt className="text-xs text-mute">{c.header}</dt>
                      <dd className={cx('mt-0.5 break-words text-ink', c.mono && 'font-mono text-[13px]')}>{c.cell(row) ?? '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );
          const cardClass = 'block rounded-2xl bg-raised/70 p-4 transition active:scale-[0.99] hover:bg-raised';
          return (
            <li key={rowKey(row)}>
              {href ? (
                <Link href={href} className={cx(cardClass, 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text')}>
                  {body}
                </Link>
              ) : onRowClick ? (
                <button type="button" onClick={() => onRowClick(row)} className={cx(cardClass, 'w-full text-left')}>
                  {body}
                </button>
              ) : (
                <div className="rounded-2xl bg-raised/70 p-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Desktop: a dense table. Wide tables scroll inside their own box, never the page. */}
      <div className="hidden md:block">
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="text-left text-xs font-medium text-mute">
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={cx('border-b border-line px-3 py-2.5 font-medium', c.align === 'right' && 'text-right')} style={c.minWidth ? { minWidth: c.minWidth } : undefined}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const href = rowHref?.(row);
                return (
                  <tr
                    key={rowKey(row)}
                    className={cx('group align-top transition-colors hover:bg-raised/70', onRowClick && 'cursor-pointer')}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((c, i) => (
                      <td
                        key={c.key}
                        className={cx(
                          'border-b border-line px-3 py-3 text-ink',
                          c.align === 'right' && 'text-right tabular-nums',
                          c.mono && 'font-mono text-[13px]'
                        )}
                      >
                        {href && i === 0 ? (
                          <Link href={href} className="font-medium underline-offset-4 hover:text-brand-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text">
                            {c.cell(row)}
                          </Link>
                        ) : (
                          c.cell(row)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page header and breadcrumbs
// ---------------------------------------------------------------------------

export function PageHeader({
  crumbs,
  title,
  meta,
  actions,
}: {
  crumbs?: { label: string; href?: string }[];
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2 text-sm text-mute">
            <ol className="flex flex-wrap items-center gap-1.5">
              {crumbs.map((c, i) => (
                <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <span aria-hidden className="text-line">/</span>}
                  {c.href ? (
                    <Link href={c.href} className="inline-flex min-h-[40px] items-center truncate hover:text-ink md:min-h-0">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="truncate text-ink/80">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="break-words text-[28px] font-semibold leading-tight tracking-tight text-ink md:text-3xl">{title}</h1>
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-mute">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1 md:[&>*]:flex-none">{actions}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Toasts. On a phone they sit above the bottom tab bar, not under it.
// ---------------------------------------------------------------------------

type ToastTone = 'ok' | 'bad' | 'info';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastCtx = createContext<((message: string, tone?: ToastTone) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((message: string, tone: ToastTone = 'ok') => {
    const id = ++seq.current;
    setItems((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === 'bad' ? 7000 : 4000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-[60] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end lg:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'bad' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto w-full max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-sheet md:w-auto',
              t.tone === 'ok' && 'bg-brand text-brand-ink',
              t.tone === 'bad' && 'bg-bad text-brand-ink',
              t.tone === 'info' && 'bg-info text-brand-ink'
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastCtx);
  if (!push) throw new Error('useToast must be used inside ToastProvider');
  return push;
}

// ---------------------------------------------------------------------------
// Bar series. Decorative: the same numbers are in a table beside it.
// ---------------------------------------------------------------------------

export function BarSeries({ points, height = 140 }: { points: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const width = Math.max(points.length * 22, 240);
  return (
    <div className="no-scrollbar overflow-x-auto">
      <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} className="h-[140px] w-full min-w-[240px]" preserveAspectRatio="none">
        {points.map((p, i) => {
          const h = Math.max(2, (p.value / max) * (height - 8));
          return <rect key={`${p.label}-${i}`} x={i * 22 + 4} y={height - h} width={14} height={h} rx={5} className="fill-brand-text/80" />;
        })}
      </svg>
    </div>
  );
}
