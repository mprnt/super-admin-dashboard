'use client';

import { useState } from 'react';
import { call, messageOf, qs } from '../../lib/client/api';
import { useResource } from '../../lib/client/console';
import { dateTime, money } from '../../lib/format';
import type { Organization, SplitSummary, SplitTerm, SplitView } from '../../lib/types';
import { DataTable, useToast } from '../ui/data';
import { ConfirmDialog } from '../ui/dialogs';
import { Button, Field, Input, Loading, Notice, Panel, Pill, Stat, Textarea, cx } from '../ui/primitives';

type Period = 'day' | 'week' | 'month' | 'year';

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

/** A plain percentage: 30%, 33.33%. Unsigned, unlike the change figures elsewhere on the console. */
function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value.toFixed(2))}%`;
}

/** Today in India as YYYY-MM-DD: the earliest day a term may start. */
function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Midnight in India on a given day, the start time for a term dated in the future. */
function startOfDayIst(date: string): string {
  return `${date}T00:00:00+05:30`;
}

const STATUS: Record<SplitTerm['status'], { tone: 'ok' | 'amber' | 'muted'; label: string }> = {
  active: { tone: 'ok', label: 'In force' },
  scheduled: { tone: 'amber', label: 'Scheduled' },
  superseded: { tone: 'muted', label: 'Replaced' },
};

/**
 * The partner's revenue split, and the one place a super admin sets it. The
 * shop reads the same figures on its own dashboard, read-only: this panel is
 * the platform's write surface, and the API refuses the write for anyone else.
 */
export function RevenueSplitPanel({ org }: { org: Organization }) {
  const toast = useToast();
  const [period, setPeriod] = useState<Period>('month');
  const view = useResource<SplitView>(`revenue-split${qs({ organizationId: org.id })}`);
  const summary = useResource<SplitSummary>(
    `revenue-split/summary${qs({ organizationId: org.id, period })}`
  );

  const [scope, setScope] = useState('');
  const [share, setShare] = useState('');
  const [startMode, setStartMode] = useState<'now' | 'date'>('now');
  const [startDate, setStartDate] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);

  const data = view.data;
  if (!data) return view.error ? <Notice tone="bad">{view.error}</Notice> : <Loading />;

  const today = todayIst();
  const shareText = share.trim();
  const shareNum = Number(shareText);
  const shareValid =
    /^\d{1,3}(\.\d{1,2})?$/.test(shareText) && shareNum >= 0 && shareNum <= 100;
  const dateValid = startMode === 'now' || (startDate !== '' && startDate >= today);
  const noteValid = note.trim().length >= 3;
  const canReview = data.applies && shareValid && dateValid && noteValid;

  const scopeLabel = scope
    ? data.byQrPoint.find((k) => k.kioskId === scope)?.kioskName ?? 'QR point'
    : 'the whole partner';
  const startLabel = startMode === 'now' ? 'from now' : `from ${startDate}, midnight IST`;

  const save = async () => {
    await call('POST', 'revenue-split', {
      organizationId: org.id,
      kioskId: scope || null,
      partnerSharePct: shareNum,
      effectiveFrom: startMode === 'date' ? startOfDayIst(startDate) : undefined,
      note: note.trim(),
    });
    toast('Revenue split recorded');
    setShare('');
    setNote('');
    setStartMode('now');
    setStartDate('');
    setScope('');
    view.reload();
    summary.reload();
  };

  return (
    <Panel
      title="Revenue split"
      hint="What the partner keeps of each paid sale; MPRNT keeps the rest. Each sale is split at the rate in force when it was paid, so a change never moves money already earned."
    >
      {!data.applies ? (
        <Notice tone="warn">
          This partner is not on Model 2 · Option A, so no revenue is split for it. Change the business model
          above first; a split can only be recorded for a revenue-share partner.
        </Notice>
      ) : (
        <div className="space-y-6">
          {/* Current */}
          <div className="grid items-start gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-mute">Partner default</p>
              {data.partnerDefault ? (
                <>
                  <p className="mt-1 font-mono text-2xl text-ink">
                    {pct(data.partnerDefault.partnerSharePct)} <span className="text-sm text-mute">partner</span>
                  </p>
                  <p className="mt-1 text-sm text-mute">
                    MPRNT keeps {pct(data.partnerDefault.platformSharePct)} · in force since{' '}
                    {dateTime(data.partnerDefault.effectiveFrom, org.timezone)}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-warn">No split has started yet. Sales are not split until one does.</p>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wider text-mute">Revenue and split</p>
                <select
                  aria-label="Period"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as Period)}
                  className="min-h-[44px] rounded-2xl border border-line bg-bg px-3 text-sm text-ink focus:border-brand-text focus:outline-none md:min-h-0 md:py-1.5"
                >
                  {PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              {summary.error && <Notice tone="bad">{summary.error}</Notice>}
              {summary.data ? (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <Stat label="Collected" value={money(summary.data.grossRevenue)} />
                  <Stat label="Partner keeps" value={money(summary.data.partnerRevenue)} />
                  <Stat label="MPRNT keeps" value={money(summary.data.platformRevenue)} />
                  <Stat
                    label="Not split"
                    value={money(summary.data.unsplitRevenue)}
                    sub="Paid before a split existed, or outside Option A. Not split after the fact."
                  />
                </div>
              ) : (
                !summary.error && <Loading />
              )}
            </div>
          </div>

          {/* By QR point */}
          <DataTable
            caption="Split by QR point"
            rows={data.byQrPoint}
            rowKey={(k) => k.kioskId}
            empty="This partner has no QR points yet"
            columns={[
              { key: 'qr', header: 'QR point', cell: (k) => k.kioskName },
              { key: 'partner', header: 'Partner', cell: (k) => pct(k.partnerSharePct) },
              { key: 'mprnt', header: 'MPRNT', cell: (k) => pct(k.platformSharePct) },
              {
                key: 'source',
                header: 'Set by',
                cell: (k) =>
                  k.source === 'qr_point' ? (
                    <Pill tone="amber">QR point override</Pill>
                  ) : k.source === 'partner' ? (
                    <Pill tone="muted">Partner default</Pill>
                  ) : (
                    <Pill tone="muted">No term yet</Pill>
                  ),
              },
            ]}
          />

          {/* Editor */}
          <div className="rounded-2xl border border-line p-4">
            <h3 className="text-sm font-medium text-ink">Set a new split</h3>
            <p className="mt-1 text-xs text-mute">
              Recorded as a new term; nothing is edited. It applies to sales paid from its start time.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Applies to">
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="w-full rounded-2xl border border-line bg-bg px-2.5 py-2 text-base text-ink focus:border-brand-text focus:outline-none md:text-sm"
                >
                  <option value="">The whole partner</option>
                  {data.byQrPoint.map((k) => (
                    <option key={k.kioskId} value={k.kioskId}>
                      QR point: {k.kioskName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Partner keeps (%)"
                hint={
                  shareValid ? `MPRNT keeps ${pct(100 - shareNum)} of each sale` : 'A number from 0 to 100, up to two decimals'
                }
                error={shareText !== '' && !shareValid ? 'Enter a percentage from 0 to 100' : null}
              >
                <Input
                  inputMode="decimal"
                  placeholder="30"
                  value={share}
                  onChange={(e) => setShare(e.target.value)}
                  className="min-h-[44px] md:min-h-0"
                />
              </Field>
              <Field label="Starts">
                <select
                  value={startMode}
                  onChange={(e) => setStartMode(e.target.value as 'now' | 'date')}
                  className="w-full rounded-2xl border border-line bg-bg px-2.5 py-2 text-base text-ink focus:border-brand-text focus:outline-none md:text-sm"
                >
                  <option value="now">Now</option>
                  <option value="date">On a date (midnight IST)</option>
                </select>
              </Field>
              {startMode === 'date' && (
                <Field
                  label="Start date"
                  error={startDate !== '' && startDate < today ? 'Pick today or a later day' : null}
                >
                  <Input
                    type="date"
                    min={today}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="min-h-[44px] md:min-h-0"
                  />
                </Field>
              )}
              <div className="md:col-span-2">
                <Field label="Why" hint="Written into the partner’s history. Say what was agreed.">
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Renewal agreed 12 Oct, 30% to partner for station S3-LIB"
                  />
                </Field>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" disabled={!canReview} onClick={() => setConfirming(true)}>
                Review split
              </Button>
            </div>
          </div>

          {/* History */}
          <DataTable
            caption="Revenue split history"
            rows={data.history}
            rowKey={(t) => t.id}
            empty="No split has been recorded"
            columns={[
              { key: 'when', header: 'Recorded', cell: (t) => dateTime(t.createdAt, org.timezone) },
              {
                key: 'scope',
                header: 'Applies to',
                cell: (t) => (t.scope === 'qr_point' ? `QR point: ${t.kioskName ?? '—'}` : 'Whole partner'),
              },
              {
                key: 'split',
                header: 'Partner / MPRNT',
                cell: (t) => `${pct(t.partnerSharePct)} / ${pct(t.platformSharePct)}`,
              },
              { key: 'starts', header: 'Starts', cell: (t) => dateTime(t.effectiveFrom, org.timezone) },
              {
                key: 'status',
                header: 'Status',
                cell: (t) => <Pill tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Pill>,
              },
              { key: 'note', header: 'Why', cell: (t) => <span className={cx('text-mute')}>{t.note}</span> },
              { key: 'by', header: 'By', cell: (t) => t.createdBy ?? '—' },
            ]}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Set the revenue split?"
        danger
        requireText={org.name}
        confirmLabel="Set split"
        body={
          <>
            {org.name} keeps <strong className="text-ink">{pct(shareNum)}</strong> and MPRNT keeps{' '}
            <strong className="text-ink">{pct(100 - shareNum)}</strong> of each paid sale, for{' '}
            <strong className="text-ink">{scopeLabel}</strong>, {startLabel}. Sales already paid keep the rate they were
            paid under. This is recorded in the audit trail.
          </>
        }
        onConfirm={async () => {
          try {
            await save();
            setConfirming(false);
          } catch (err) {
            toast(messageOf(err));
            throw err;
          }
        }}
      />
    </Panel>
  );
}
