'use client';

import Link from 'next/link';
import type { Readiness } from '../../lib/readiness.ts';
import { Icons } from './icons';
import { cx } from './primitives';

function meterTone(r: Readiness): string {
  if (r.done === r.total) return 'bg-ok';
  if (r.total - r.done <= 2) return 'bg-warn';
  return 'bg-bad';
}

/**
 * How ready a partner is, as one segment per check: filled when done. The figure beside
 * it says the same in words, so colour is never the only signal.
 */
export function ReadinessMeter({ readiness, onRail = false }: { readiness: Readiness; onRail?: boolean }) {
  const tone = meterTone(readiness);
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5" title={`${readiness.done} of ${readiness.total} ready`}>
      <span aria-hidden className="flex gap-[2px]">
        {readiness.checks.map((c) => (
          <span
            key={c.key}
            className={cx('h-2.5 w-[5px] rounded-[1.5px]', c.done ? tone : onRail ? 'bg-white/15' : 'bg-line-strong')}
          />
        ))}
      </span>
      <span className={cx('tnum text-[11.5px] font-semibold', onRail ? 'text-side-mute' : 'text-mute')}>
        {readiness.done}/{readiness.total}
      </span>
      <span className="sr-only">
        {readiness.done} of {readiness.total} readiness checks done
      </span>
    </span>
  );
}

/** Every readiness check, each linking to the page where it is seen or fixed. */
export function ReadinessChecklist({ readiness, base }: { readiness: Readiness; base: string }) {
  return (
    <ul className="-mx-1 divide-y divide-line">
      {readiness.checks.map((c) => (
        <li key={c.key}>
          <Link href={base + c.path} className="group flex items-center gap-3 rounded-md px-1 py-2.5 transition hover:bg-raised/70">
            <span
              className={cx(
                'grid h-6 w-6 shrink-0 place-items-center rounded-md',
                c.done ? 'bg-ok/15 text-ok' : 'bg-bad/10 text-bad'
              )}
            >
              {c.done ? <Icons.check className="h-3.5 w-3.5" /> : <Icons.cross className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-ink">{c.label}</span>
              <span className="block truncate text-[12px] text-mute">{c.detail}</span>
            </span>
            <span className="sr-only">{c.done ? 'Done' : 'Missing'}</span>
            <span className="text-mute transition group-hover:translate-x-0.5 group-hover:text-ink">
              <Icons.chevron />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A count chip for the navigation rail. Red when it needs attention. */
export function RailBadge({ value, alert = false }: { value: number | null | undefined; alert?: boolean }) {
  if (value === null || value === undefined) return null;
  return (
    <span
      className={cx(
        'tnum ml-auto shrink-0 rounded-md px-1.5 py-[1px] text-[11px] font-bold',
        alert && value > 0 ? 'bg-bad text-white' : 'bg-white/10 text-side-mute'
      )}
    >
      {value}
    </span>
  );
}

/**
 * A run of columns for a figure over time, for the dark headline band. Each column
 * carries its own label for a screen reader and on hover; the figures are also in the
 * reports, so the chart is a summary, never the only place a number lives.
 */
export function TrendBars({ points, format }: { points: { label: string; value: number }[]; format: (v: number) => string }) {
  if (points.length === 0) return <p className="text-[12.5px] text-side-mute">No sales in this period yet.</p>;
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="flex h-full min-h-[120px] flex-col">
      <ul className="flex flex-1 items-end gap-[3px]" aria-label="Revenue over the period">
        {points.map((p, i) => (
          <li key={`${p.label}-${i}`} className="group relative flex h-full flex-1 items-end" title={`${p.label}: ${format(p.value)}`}>
            <span
              className="block w-full rounded-t-[2px] bg-accent/80 transition group-hover:bg-accent"
              style={{ height: `${Math.max(3, (p.value / max) * 100)}%` }}
            />
            <span className="sr-only">
              {p.label}: {format(p.value)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-between text-[11px] text-side-mute">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
