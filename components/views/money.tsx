'use client';

import { useState, type FormEvent } from 'react';
import { call, downloadFile, messageOf, qs, seg } from '../../lib/client/api';
import { useConsole, useResource } from '../../lib/client/console';
import { count, dateTime, duration, money, percent, shortDate } from '../../lib/format';
import type { AttentionJob, Comparison, KioskBreakdownRow, PriceList, Range, SeriesPoint, SessionRow, Summary } from '../../lib/types';
import { BarSeries, DataTable, PageHeader, useToast } from '../ui/data';
import { ConfirmDialog, Modal } from '../ui/dialogs';
import { Button, Field, Input, KV, Notice, Panel, Pill, Select, Stat } from '../ui/primitives';
import { Id, RawRecord, StatusPill } from './common';
import { RevenueByPrinter } from './revenue';

// ---------------------------------------------------------------------------
// Shared period picker
// ---------------------------------------------------------------------------

const PERIODS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

function PeriodPicker({ period, onPeriod }: { period: string; onPeriod: (p: string) => void }) {
  return (
    <Select aria-label="Period" value={period} onChange={(e) => onPeriod(e.target.value)} className="w-auto min-w-[150px]">
      {PERIODS.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Sessions (jobs): every job, filterable, exportable, each one openable
// ---------------------------------------------------------------------------

interface SessionsResponse {
  range: Range & { timezone: string };
  total: number;
  limit: number;
  offset: number;
  sessions: SessionRow[];
}

const PAGE = 50;

export function SessionsView({
  orgId,
  kioskId,
  printerId,
  title,
  crumbs,
}: {
  orgId?: string;
  kioskId?: string;
  printerId?: string;
  title: string;
  crumbs?: { label: string; href?: string }[];
}) {
  const toast = useToast();
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<SessionRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const rangeValid = (!from && !to) || Boolean(from && to);

  const filters = {
    organizationId: orgId,
    kioskId,
    printerId,
    period,
    from: rangeValid ? from : undefined,
    to: rangeValid ? to : undefined,
    status: status || undefined,
  };
  const path = `reports/sessions${qs({ ...filters, limit: PAGE, offset })}`;
  const data = useResource<SessionsResponse>(rangeValid ? path : null);

  const total = data.data?.total ?? 0;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + PAGE, total);

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title={title}
        meta={
          data.data ? (
            <span>
              {count(total)} job{total === 1 ? '' : 's'} · {shortDate(data.data.range.from, data.data.range.timezone)} to{' '}
              {shortDate(data.data.range.to, data.data.range.timezone)}
            </span>
          ) : null
        }
        actions={
          <>
            <Button
              size="sm"
              disabled={exporting || !rangeValid}
              onClick={async () => {
                setExporting(true);
                try {
                  await downloadFile(`reports/sessions/export${qs(filters)}`, `mprnt-jobs-${new Date().toISOString().slice(0, 10)}.csv`);
                  toast('Export downloaded');
                } catch (e) {
                  toast(messageOf(e), 'bad');
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Button size="sm" onClick={data.reload}>
              Refresh
            </Button>
          </>
        }
      />

      <Panel>
        <div className="mb-4 grid gap-3 md:grid-cols-5">
          <Field label="Period">
            <PeriodPicker period={period} onPeriod={(p) => { setPeriod(p); setOffset(0); }} />
          </Field>
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setOffset(0); }} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setOffset(0); }} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
              <option value="">Any</option>
              <option value="pending">Pending</option>
              <option value="queued">Queued</option>
              <option value="printing">Printing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          <div className="flex items-end text-xs text-mute">{rangeValid ? 'Leave both dates empty to use the period.' : 'Set both From and To, or neither.'}</div>
        </div>

        {data.error && <div className="mb-3"><Notice tone="bad">{data.error}</Notice></div>}

        <DataTable
          caption="Jobs"
          rows={data.data?.sessions ?? []}
          rowKey={(r) => r.jobId}
          empty={data.loading ? 'Loading…' : 'No jobs match these filters'}
          onRowClick={(r) => setOpen(r)}
          columns={[
            { key: 'when', header: 'When', cell: (r) => dateTime(r.createdAt, data.data?.range.timezone) },
            { key: 'job', header: 'Job', cell: (r) => <Id value={r.jobId} /> },
            { key: 'session', header: 'Session', mono: true, cell: (r) => r.sessionCode ?? '—' },
            { key: 'kiosk', header: 'QR point', cell: (r) => <span className="font-mono text-[12px]">{r.kiosk.code}</span> },
            { key: 'printer', header: 'Printer', cell: (r) => (r.printer ? r.printer.name ?? r.printer.id : <span className="text-mute" title="This job never reached a printer">Not at a printer</span>) },
            { key: 'status', header: 'Status', cell: (r) => <StatusPill status={r.status} /> },
            { key: 'pay', header: 'Payment', cell: (r) => <StatusPill status={r.paymentStatus} /> },
            { key: 'set', header: 'Settings', cell: (r) => `${r.settings.colorMode} · ${r.settings.printSides} · ×${r.settings.copies}` },
            { key: 'pages', header: 'Pages', align: 'right', cell: (r) => `${count(r.pages.printed)} / ${count(r.pages.charged)}` },
            { key: 'amt', header: 'Amount', align: 'right', cell: (r) => money(r.amount) },
            { key: 'ppp', header: 'Per page', align: 'right', cell: (r) => money(r.pricePerPage) },
            { key: 'dur', header: 'Print time', align: 'right', cell: (r) => duration(r.durationSeconds) },
          ]}
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-mute">
          <span>
            {first}–{last} of {count(total)}
          </span>
          <div className="flex gap-2">
            <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              Previous
            </Button>
            <Button size="sm" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
              Next
            </Button>
          </div>
        </div>
      </Panel>

      <Modal open={open !== null} onClose={() => setOpen(null)} title={`Job ${open?.jobId ?? ''}`} wide>
        {open && (
          <div className="space-y-4">
            <KV
              items={[
                { label: 'Job ID', value: open.jobId, mono: true, wide: true },
                { label: 'Session code', value: open.sessionCode, mono: true },
                { label: 'Created', value: dateTime(open.createdAt, data.data?.range.timezone) },
                { label: 'Completed', value: dateTime(open.completedAt, data.data?.range.timezone) },
                { label: 'QR point', value: `${open.kiosk.code} · ${open.kiosk.name ?? ''}` },
                { label: 'Printer', value: open.printer ? `${open.printer.name ?? ''} · ${open.printer.id}` : 'Not assigned' },
                { label: 'Status', value: <StatusPill status={open.status} /> },
                { label: 'Payment', value: <StatusPill status={open.paymentStatus} /> },
                { label: 'Colour mode', value: open.settings.colorMode },
                { label: 'Sides', value: open.settings.printSides },
                { label: 'Copies', value: `${open.settings.copies}` },
                { label: 'Pages charged', value: `${open.pages.charged}` },
                { label: 'Pages printed', value: `${open.pages.printed}` },
                { label: 'Sheets', value: `${open.pages.sheets}` },
                { label: 'Price per page', value: money(open.pricePerPage) },
                { label: 'Amount', value: money(open.amount) },
                { label: 'Print duration', value: duration(open.durationSeconds) },
                { label: 'Error', value: open.errorMessage, wide: true },
              ]}
            />
            <p className="text-xs text-mute">
              The API does not include customer document names, storage keys, or the customer&apos;s network details, and this console does not add them.
            </p>
            <RawRecord value={open} label="Job record" />
          </div>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Money: revenue, volume and the QR point breakdown for one partner
// ---------------------------------------------------------------------------

export function MoneyView({ orgId }: { orgId: string }) {
  const ctx = useConsole();
  const [period, setPeriod] = useState('month');
  const org = ctx.organizations.find((o) => o.id === orgId);

  const summary = useResource<{ range: Range & { timezone: string }; summary: Summary; comparison: Comparison | null }>(
    `reports/summary${qs({ organizationId: orgId, period })}`
  );
  const series = useResource<{ range: Range; bucket: string; series: SeriesPoint[] }>(`reports/series${qs({ organizationId: orgId, period })}`);
  const kiosks = useResource<{ range: Range; kiosks: KioskBreakdownRow[] }>(`reports/kiosks${qs({ organizationId: orgId, period })}`);

  const s = summary.data?.summary;
  const change = summary.data?.comparison?.change;
  const tz = org?.timezone;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-mute">
          {summary.data
            ? `${shortDate(summary.data.range.from, tz)} to ${shortDate(summary.data.range.to, tz)} · ${summary.data.range.timezone}`
            : 'Loading the period…'}
        </div>
        <div className="flex gap-2">
          <PeriodPicker period={period} onPeriod={setPeriod} />
          <Button size="sm" onClick={() => { summary.reload(); series.reload(); kiosks.reload(); }}>
            Refresh
          </Button>
        </div>
      </div>

      {(summary.error || series.error || kiosks.error) && (
        <div className="mb-4">
          <Notice tone="bad">{summary.error ?? series.error ?? kiosks.error}</Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Revenue" value={money(s?.revenue)} sub={`${percent(change?.revenuePct ?? null)} vs previous`} />
        <Stat label="Paid jobs" value={count(s?.paidJobs)} sub={`${percent(change?.paidJobsPct ?? null)} vs previous`} />
        <Stat label="Printed" value={count(s?.completedJobs)} sub={`${count(s?.failedJobs)} failed · ${count(s?.inProgressJobs)} in progress`} />
        <Stat label="Fulfilment" value={s?.fulfilmentRate === null || s?.fulfilmentRate === undefined ? '—' : `${s.fulfilmentRate}%`} sub="Paid jobs that printed" />
        <Stat label="Sessions" value={count(s?.sessions)} sub={`${count(s?.totalJobs)} jobs in total`} />
        <Stat label="Pages charged" value={count(s?.pagesCharged)} sub={`${count(s?.pagesPrinted)} printed`} />
        <Stat label="Colour / B&W pages" value={`${count(s?.colorPages)} / ${count(s?.bwPages)}`} />
        <Stat label="Average order" value={money(s?.averageOrderValue)} sub={`Average print ${duration(s?.avgPrintSeconds)}`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Revenue by day" hint="Paid jobs, bucketed in the partner's timezone">
          {series.data && series.data.series.length > 0 ? (
            <>
              <BarSeries points={series.data.series.map((p) => ({ label: p.date, value: p.revenue }))} />
              <div className="mt-3 max-h-64 overflow-y-auto">
                <DataTable
                  caption="Revenue by day"
                  rows={series.data.series}
                  rowKey={(p) => p.date}
                  empty="No sales in this period"
                  columns={[
                    { key: 'date', header: 'Day', cell: (p) => shortDate(p.date) },
                    { key: 'jobs', header: 'Jobs', align: 'right', cell: (p) => count(p.jobs) },
                    { key: 'done', header: 'Printed', align: 'right', cell: (p) => count(p.completed) },
                    { key: 'failed', header: 'Failed', align: 'right', cell: (p) => count(p.failed) },
                    { key: 'pages', header: 'Pages', align: 'right', cell: (p) => count(p.pages) },
                    { key: 'rev', header: 'Revenue', align: 'right', cell: (p) => money(p.revenue) },
                  ]}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-mute">{series.loading ? 'Loading…' : 'No sales in this period.'}</p>
          )}
        </Panel>

        <Panel title="By QR point" hint="Which QR point earns, for this period">
          <DataTable
            caption="Revenue by QR point"
            rows={kiosks.data?.kiosks ?? []}
            rowKey={(k) => k.kioskId}
            empty="No QR points yet"
            rowHref={(k) => `/partners/${orgId}/qr-points/${k.kioskId}`}
            columns={[
              { key: 'code', header: 'Code', mono: true, cell: (k) => k.code },
              { key: 'name', header: 'Name', cell: (k) => k.name ?? '—' },
              { key: 'jobs', header: 'Jobs', align: 'right', cell: (k) => count(k.jobs) },
              { key: 'done', header: 'Printed', align: 'right', cell: (k) => count(k.completed) },
              { key: 'pages', header: 'Pages', align: 'right', cell: (k) => count(k.pages) },
              { key: 'rev', header: 'Revenue', align: 'right', cell: (k) => money(k.revenue) },
            ]}
          />
        </Panel>
      </div>

      <div className="mt-4">
        <RevenueByPrinter orgId={orgId} period={period} timezone={tz} />
      </div>

      <div className="mt-4">
        <RawRecord value={{ summary: summary.data ?? null, series: series.data ?? null, kiosks: kiosks.data ?? null }} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pricing: rates in force and every rate ever published
// ---------------------------------------------------------------------------

/**
 * Each partner's own black-and-white and colour rate, read only: the shop sets it from its
 * own dashboard. The MPRNT default is the one rate this console sets, for a partner that
 * has not set its own.
 */
export function PricingView({ orgId }: { orgId?: string }) {
  const ctx = useConsole();
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);

  const lists = useResource<{ priceLists: PriceList[] }>('pricing/lists');
  const all = lists.data?.priceLists ?? [];
  // The API lists the newest rate first, so the first match is the rate in force.
  const platform = all.filter((p) => p.scope === 'platform');
  const platformNow = platform[0] ?? null;
  const shopRates = all.filter((p) => p.scope === 'organization' && p.kioskId === null);
  const shopRateFor = (id: string) => shopRates.find((p) => p.organizationId === id) ?? null;

  const org = orgId ? ctx.organizations.find((o) => o.id === orgId) : null;
  const partners = orgId ? ctx.organizations.filter((o) => o.id === orgId) : ctx.organizations;

  return (
    <>
      <PageHeader
        crumbs={org ? [{ label: 'Partners', href: '/partners' }, { label: org.name, href: `/partners/${org.id}` }] : undefined}
        title="Pricing"
        meta={<span>Each partner sets its own black-and-white and colour rate from its own dashboard. MPRNT can see them here, and does not change them.</span>}
        actions={
          !orgId ? (
            <Button variant="primary" onClick={() => setPublishing(true)}>
              Set MPRNT default
            </Button>
          ) : undefined
        }
      />

      <Panel title={org ? org.name : 'Rates by partner'} hint="The rate in force for each partner's customers. A partner that has not set one pays the MPRNT default.">
        {lists.error && <Notice tone="bad">{lists.error}</Notice>}
        <DataTable
          caption="Partner rates"
          rows={partners}
          rowKey={(o) => o.id}
          empty="No partners yet"
          rowHref={(o) => `/partners/${o.id}`}
          columns={[
            { key: 'partner', header: 'Partner', cell: (o) => o.name },
            { key: 'bw', header: 'B&W / page', align: 'right', cell: (o) => money(shopRateFor(o.id)?.bwPerPage ?? platformNow?.bwPerPage) },
            { key: 'col', header: 'Colour / page', align: 'right', cell: (o) => money(shopRateFor(o.id)?.colorPerPage ?? platformNow?.colorPerPage) },
            {
              key: 'by',
              header: 'Set by',
              cell: (o) => {
                const r = shopRateFor(o.id);
                if (!r) return <Pill tone="warn">MPRNT default</Pill>;
                return <Pill tone={r.createdBy === 'shop' ? 'ok' : 'muted'}>{r.createdBy === 'shop' ? 'The shop' : 'MPRNT'}</Pill>;
              },
            },
            {
              key: 'since',
              header: 'In force since',
              cell: (o) => {
                const r = shopRateFor(o.id);
                return r ? dateTime(r.effectiveFrom, o.timezone) : '—';
              },
            },
          ]}
        />
      </Panel>

      {orgId && (
        <div className="mt-4">
          <Panel title="Rate history" hint="Every rate this partner has set, newest first. A rate is never edited in place.">
            <DataTable
              caption="Rate history"
              rows={shopRates.filter((p) => p.organizationId === orgId)}
              rowKey={(p) => p.id}
              empty="The partner has not set its own rates yet"
              columns={[
                { key: 'from', header: 'Takes effect', cell: (p) => dateTime(p.effectiveFrom, org?.timezone) },
                { key: 'by', header: 'Set by', cell: (p) => (p.createdBy === 'shop' ? 'The shop' : 'MPRNT') },
                { key: 'bw', header: 'B&W / page', align: 'right', cell: (p) => money(p.bwPerPage) },
                { key: 'col', header: 'Colour / page', align: 'right', cell: (p) => money(p.colorPerPage) },
              ]}
            />
          </Panel>
        </div>
      )}

      {!orgId && (
        <div className="mt-4">
          <Panel title="MPRNT default" hint="Used for a partner that has not set its own rates">
            <DataTable
              caption="MPRNT default rates"
              rows={platform}
              rowKey={(p) => p.id}
              empty="No MPRNT default has been set"
              columns={[
                { key: 'from', header: 'Takes effect', cell: (p) => dateTime(p.effectiveFrom) },
                { key: 'bw', header: 'B&W / page', align: 'right', cell: (p) => money(p.bwPerPage) },
                { key: 'col', header: 'Colour / page', align: 'right', cell: (p) => money(p.colorPerPage) },
                { key: 'min', header: 'Minimum charge', align: 'right', cell: (p) => money(p.minCharge) },
                { key: 'made', header: 'Set', cell: (p) => dateTime(p.createdAt) },
              ]}
            />
          </Panel>
        </div>
      )}

      {publishing && (
        <PublishPlatformDialog
          onClose={() => setPublishing(false)}
          onDone={() => {
            toast('MPRNT default set');
            lists.reload();
          }}
        />
      )}
    </>
  );
}

/** Sets the MPRNT default: the rate for a partner that has not set its own. */
function PublishPlatformDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [bw, setBw] = useState('');
  const [color, setColor] = useState('');
  const [minCharge, setMinCharge] = useState('0');
  const [from, setFrom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (bw === '' || color === '') {
      setError('Enter the black-and-white and the colour rate.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call('POST', 'pricing/lists', {
        bwPerPage: Number(bw),
        colorPerPage: Number(color),
        minCharge: Number(minCharge || 0),
        ...(from ? { effectiveFrom: new Date(from).toISOString() } : {}),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Set the MPRNT default">
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-mute">
          The default applies to a partner that has not set its own rates. A rate a partner has set always takes precedence.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Black and white, per page">
            <Input type="number" min={0} step="0.01" value={bw} onChange={(e) => setBw(e.target.value)} required />
          </Field>
          <Field label="Colour, per page">
            <Input type="number" min={0} step="0.01" value={color} onChange={(e) => setColor(e.target.value)} required />
          </Field>
          <Field label="Minimum charge">
            <Input type="number" min={0} step="0.01" value={minCharge} onChange={(e) => setMinCharge(e.target.value)} />
          </Field>
        </div>
        <Field label="Takes effect" hint="Leave blank to take effect now">
          <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Set default'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function AttentionView({ orgId }: { orgId?: string }) {
  const ctx = useConsole();
  const toast = useToast();
  const [refunding, setRefunding] = useState<AttentionJob | null>(null);
  const jobs = useResource<{ count: number; jobs: AttentionJob[] }>(`attention${qs({ organizationId: orgId })}`);
  const org = orgId ? ctx.organizations.find((o) => o.id === orgId) : null;

  const partnerOf = (code: string) => ctx.kiosks.find((k) => k.kioskId === code)?.organizationName ?? '—';

  return (
    <>
      <PageHeader
        crumbs={org ? [{ label: 'Partners', href: '/partners' }, { label: org.name, href: `/partners/${org.id}` }] : undefined}
        title="Attention"
        meta={<span>Paid jobs that have not printed. A refund is the only way to settle one that will not.</span>}
        actions={
          <Button size="sm" onClick={jobs.reload}>
            Refresh
          </Button>
        }
      />

      <Panel
        title={`${count(jobs.data?.count ?? 0)} waiting`}
        hint="Oldest first. A paid job still unprinted after the threshold is marked as a refund candidate."
      >
        {jobs.error && <div className="mb-3"><Notice tone="bad">{jobs.error}</Notice></div>}
        <DataTable
          caption="Paid jobs that have not printed"
          rows={jobs.data?.jobs ?? []}
          rowKey={(j) => j.jobId}
          empty={jobs.loading ? 'Loading…' : 'Nothing waiting. Every paid job has printed.'}
          columns={[
            { key: 'job', header: 'Job', cell: (j) => <Id value={j.jobId} /> },
            { key: 'partner', header: 'Partner', cell: (j) => (orgId ? org?.name : partnerOf(j.kiosk.code)) },
            { key: 'kiosk', header: 'QR point', mono: true, cell: (j) => j.kiosk.code },
            { key: 'amount', header: 'Amount', align: 'right', cell: (j) => money(j.amount) },
            { key: 'age', header: 'Waiting', cell: (j) => duration(j.ageSeconds) },
            {
              key: 'refund',
              header: 'Refund',
              cell: (j) =>
                j.refundCandidate ? (
                  <Button size="sm" variant="danger" onClick={() => setRefunding(j)}>
                    Refund
                  </Button>
                ) : (
                  <Pill tone="muted">Not yet due</Pill>
                ),
            },
            { key: 'status', header: 'Job status', cell: (j) => <StatusPill status={j.status} /> },
            { key: 'queue', header: 'Queue', cell: (j) => (j.queueStatus ? <StatusPill status={j.queueStatus} /> : '—') },
            { key: 'retries', header: 'Retries', align: 'right', cell: (j) => count(j.retryCount) },
            { key: 'error', header: 'Error', cell: (j) => (j.errorCode || j.errorMessage ? `${j.errorCode ?? ''} ${j.errorMessage ?? ''}`.trim() : '—') },
          ]}
        />
      </Panel>

      {refunding && (
        <RefundDialog
          job={refunding}
          onClose={() => setRefunding(null)}
          onDone={() => {
            toast('Refund issued');
            jobs.reload();
            ctx.reload();
          }}
        />
      )}
    </>
  );
}

function RefundDialog({ job, onClose, onDone }: { job: AttentionJob; onClose: () => void; onDone: () => void }) {
  const short = job.jobId.slice(0, 8);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Refund this job?"
      danger
      requireText={short}
      reason={{ label: 'Reason', min: 3 }}
      confirmLabel="Issue refund"
      body={
        <>
          The full amount, {money(job.amount)}, goes back to the customer. Type <span className="font-mono text-ink">{short}</span> to confirm. Each
          refund is audited with the reason you give.
        </>
      }
      onConfirm={async (reason) => {
        await call('POST', `print-jobs/${seg(job.jobId)}/refund`, { reason });
        onDone();
      }}
    />
  );
}
