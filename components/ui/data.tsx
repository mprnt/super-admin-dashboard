'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx, Empty } from './primitives';

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
  /** Pixels; keeps a column from collapsing so the table scrolls instead. */
  minWidth?: number;
}

/**
 * A dense, sortable-by-position table. On a narrow screen it scrolls
 * horizontally rather than hiding columns, so no field disappears.
 */
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

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-mute">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx('px-2.5 py-2 font-medium', c.align === 'right' && 'text-right')} style={c.minWidth ? { minWidth: c.minWidth } : undefined}>
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
                className={cx('border-b border-line/60 align-top hover:bg-raised/60', onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cx(
                      'px-2.5 py-2.5 text-ink',
                      c.align === 'right' && 'text-right tabular-nums',
                      c.mono && 'font-mono text-[13px]'
                    )}
                  >
                    {href && i === 0 ? (
                      <Link href={href} className="text-ink underline-offset-2 hover:text-amber hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">
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
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-mute">
            <ol className="flex flex-wrap items-center gap-1.5">
              {crumbs.map((c, i) => (
                <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden>/</span>}
                  {c.href ? (
                    <Link href={c.href} className="hover:text-ink">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-ink/80">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="break-words text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {meta && <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-mute">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Toasts
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
    setItems((list) => [...list.slice(-3), { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === 'bad' ? 7000 : 4000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'bad' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto rounded border bg-surface px-3.5 py-2.5 text-sm shadow-xl',
              t.tone === 'ok' && 'border-ok/50 text-ok',
              t.tone === 'bad' && 'border-bad/50 text-bad',
              t.tone === 'info' && 'border-info/50 text-info'
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
// Bar series (revenue, jobs). Decorative: the same numbers are in a table.
// ---------------------------------------------------------------------------

export function BarSeries({ points, height = 120 }: { points: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const width = Math.max(points.length * 18, 240);
  return (
    <div className="overflow-x-auto">
      <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} className="h-[120px] w-full min-w-[240px]" preserveAspectRatio="none">
        {points.map((p, i) => {
          const h = Math.max(1, (p.value / max) * (height - 6));
          return <rect key={`${p.label}-${i}`} x={i * 18 + 3} y={height - h} width={12} height={h} rx={2} className="fill-amber/80" />;
        })}
      </svg>
    </div>
  );
}
