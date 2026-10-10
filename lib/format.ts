/**
 * Display formatting. Pure, so the tests run it without a browser.
 *
 * Dates arrive from the API as ISO strings. A partner's own figures are shown in
 * the partner's timezone (as the shop dashboard does); platform-wide views use
 * the operator's browser timezone, labelled as such.
 */

const rupee = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat('en-IN');

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return rupee.format(value);
}

export function count(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return integer.format(value);
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

/** "1h 04m", "4m 09s", "38s". */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

/** "3 min ago", "2 days ago", as a plain relative label. */
export function ago(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/**
 * A timestamp in a given timezone, e.g. "10 Oct 2026, 14:05". Bare dates
 * (YYYY-MM-DD) are shown as dates, never shifted through `new Date()` in UTC.
 */
export function dateTime(value: string | Date | null | undefined, timeZone?: string): string {
  if (!value) return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timeZone || undefined,
  });
}

/** A short date for dense tables, e.g. "10 Oct 2026". */
export function shortDate(value: string | Date | null | undefined, timeZone?: string): string {
  if (!value) return '—';
  const date =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00Z`)
      : value instanceof Date
        ? value
        : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: timeZone || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined),
  });
}

/** Turns "print_jobs" or "admin_user.password_reset" into "Admin user · password reset". */
export function actionLabel(action: string): string {
  const [head, ...rest] = action.split('.');
  const words = (s: string) => s.replace(/_/g, ' ');
  const left = words(head ?? '');
  const right = rest.map(words).join(' · ');
  const text = right ? `${left} · ${right}` : left;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Lowercase snake/kebab identifiers to a readable sentence case. */
export function titleCase(s: string): string {
  return s
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
