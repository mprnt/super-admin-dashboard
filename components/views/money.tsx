'use client';

import { useState, type FormEvent } from 'react';
import { call, downloadFile, messageOf, qs, seg } from '../../lib/client/api';
import { useConsole, useResource } from '../../lib/client/console';
import { count, dateTime, duration, money, percent, shortDate } from '../../lib/format';
import type { AttentionJob, Comparison, Kiosk, KioskBreakdownRow, PriceList, PricingInfo, Range, SeriesPoint, SessionRow, Summary } from '../../lib/types';
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

export function PricingView({ orgId }: { orgId?: string }) {
  const ctx = useConsole();
  const toast = useToast();
  const [publishing, setPublishing] = useState(false);

  const lists = useResource<{ priceLists: PriceList[] }>(`pricing/lists${qs({ organizationId: orgId })}`);
  const org = orgId ? ctx.organizations.find((o) => o.id === orgId) : null;
  const kiosks = orgId ? ctx.kiosks.filter((k) => k.organizationId === orgId) : ctx.kiosks;

  return (
    <>
      <PageHeader
        crumbs={org ? [{ label: 'Partners', href: '/partners' }, { label: org.name, href: `/partners/${org.id}` }] : undefined}
        title="Pricing"
        meta={
          <span>
            Rates are never edited in place. A new rate supersedes the old one from its start date, so quotes already given stay valid.
          </span>
        }
        actions={
          <Button variant="primary" onClick={() => setPublishing(true)}>
            Publish rates
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Rates in force" hint="Resolved for each QR point. The most specific rate applies: QR point, then partner, then platform." className="xl:col-span-2">
          {kiosks.length === 0 ? (
            <p className="text-sm text-mute">No QR points, so there is no per-point rate to resolve.</p>
          ) : (
            <div className="space-y-2">
              {kiosks.map((k) => (
                <KioskRate key={k.id} kiosk={k} />
              ))}
            </div>
          )}
          {orgId && (
            <p className="mt-3 text-xs text-mute">
              The API resolves rates per QR point. A partner-wide figure is not returned, so none is shown here.
            </p>
          )}
        </Panel>

        <Panel title="Publish" hint="Takes effect at the start date, or immediately if left blank">
          <p className="text-sm text-mute">
            Publishing changes what customers pay from the start date. It is audited and cannot be taken back. Supersede it with a later rate to correct
            it.
          </p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => setPublishing(true)}>
              Publish rates
            </Button>
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Rate history" hint="Every rate published in this scope, newest first">
          {lists.error && <Notice tone="bad">{lists.error}</Notice>}
          <DataTable
            caption="Price lists"
            rows={lists.data?.priceLists ?? []}
            rowKey={(p) => p.id}
            empty="No rates have been published in this scope"
            columns={[
              { key: 'from', header: 'Takes effect', cell: (p) => dateTime(p.effectiveFrom, org?.timezone) },
              { key: 'scope', header: 'Scope', cell: (p) => <Pill tone={p.scope === 'platform' ? 'muted' : p.scope === 'kiosk' ? 'amber' : 'ok'}>{p.scope}</Pill> },
              { key: 'org', header: 'Partner', cell: (p) => p.organizationName ?? 'Whole platform' },
              { key: 'kiosk', header: 'QR point', mono: true, cell: (p) => p.kioskCode ?? '—' },
              { key: 'bw', header: 'B&W / page', align: 'right', cell: (p) => money(p.bwPerPage) },
              { key: 'col', header: 'Colour / page', align: 'right', cell: (p) => money(p.colorPerPage) },
              { key: 'min', header: 'Minimum charge', align: 'right', cell: (p) => money(p.minCharge) },
              { key: 'made', header: 'Published', cell: (p) => dateTime(p.createdAt, org?.timezone) },
              { key: 'id', header: 'ID', cell: (p) => <Id value={p.id} /> },
            ]}
          />
        </Panel>
      </div>

      {publishing && (
        <PublishRatesDialog
          orgId={orgId}
          kiosks={kiosks}
          onClose={() => setPublishing(false)}
          onDone={() => {
            toast('Rates published');
            lists.reload();
          }}
        />
      )}
    </>
  );
}

function KioskRate({ kiosk }: { kiosk: Kiosk }) {
  const rate = useResource<PricingInfo>(`pricing${qs({ kioskId: kiosk.id })}`);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm text-ink">
          <span className="font-mono">{kiosk.kioskId}</span> · {kiosk.name}
        </div>
        <div className="text-xs text-mute">{rate.error ? rate.error : rate.data ? `source: ${rate.data.source}` : 'Loading…'}</div>
      </div>
      {rate.data && (
        <div className="flex gap-4 font-mono text-sm tabular-nums text-ink">
          <span>B&W {money(rate.data.blackAndWhite.pricePerPage)}</span>
          <span>Colour {money(rate.data.color.pricePerPage)}</span>
          <span>Min {money(rate.data.minCharge)}</span>
        </div>
      )}
    </div>
  );
}

function PublishRatesDialog({
  orgId,
  kiosks,
  onClose,
  onDone,
}: {
  orgId?: string;
  kiosks: Kiosk[];
  onClose: () => void;
  onDone: () => void;
}) {
  const ctx = useConsole();
  const [scope, setScope] = useState<'platform' | 'organization' | 'kiosk'>(orgId ? 'organization' : 'platform');
  const [kioskId, setKioskId] = useState(kiosks[0]?.id ?? '');
  const [partnerId, setPartnerId] = useState('');
  const [bw, setBw] = useState('');
  const [color, setColor] = useState('');
  const [minCharge, setMinCharge] = useState('0');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [confirming, setConfirming] = useState(false);

  const kiosk = kiosks.find((k) => k.id === kioskId);
  // The partner a rate is for is always explicit. On the platform page a
  // partner-wide rate never takes its partner from a QR point picker.
  const targetPartner = orgId ?? partnerId;
  const partner = ctx.organizations.find((o) => o.id === targetPartner);

  const valid =
    bw !== '' &&
    color !== '' &&
    (scope === 'platform' || (scope === 'organization' && Boolean(partner)) || (scope === 'kiosk' && Boolean(kiosk)));

  const payload = () => {
    const base = {
      bwPerPage: Number(bw),
      colorPerPage: Number(color),
      minCharge: Number(minCharge) || 0,
      effectiveFrom: effectiveFrom || undefined,
    };
    if (scope === 'platform') return { ...base, organizationId: null, kioskId: null };
    if (scope === 'organization') return { ...base, organizationId: partner?.id ?? null, kioskId: null };
    return { ...base, organizationId: kiosk?.organizationId ?? null, kioskId: kiosk?.id ?? null };
  };

  const describedScope =
    scope === 'platform'
      ? 'the whole platform'
      : scope === 'organization'
        ? partner?.name ?? 'the partner'
        : `QR point ${kiosk?.kioskId ?? ''}`;

  async function publish() {
    await call('POST', 'pricing/lists', payload());
    onDone();
  }
  // The publish dialog closes with the parent once the rates are saved.

  return (
    <>
      <Modal open={!confirming} onClose={onClose} title="Publish rates">
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (valid) setConfirming(true);
          }}
        >
          <Field label="Scope" hint="The most specific rate applies: QR point first, then partner, then platform.">
            <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              {!orgId && <option value="platform">Whole platform</option>}
              <option value="organization">Whole partner</option>
              <option value="kiosk">One QR point</option>
            </Select>
          </Field>

          {scope === 'organization' && !orgId && (
            <Field label="Partner">
              <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">Choose a partner</option>
                {ctx.organizations
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}

          {scope === 'kiosk' && (
            <Field label="QR point">
              <Select value={kioskId} onChange={(e) => setKioskId(e.target.value)}>
                {kiosks.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.kioskId} · {k.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Black & white, per page (₹)">
              <Input type="number" min={0} step="0.01" value={bw} onChange={(e) => setBw(e.target.value)} required />
            </Field>
            <Field label="Colour, per page (₹)">
              <Input type="number" min={0} step="0.01" value={color} onChange={(e) => setColor(e.target.value)} required />
            </Field>
            <Field label="Minimum charge (₹)">
              <Input type="number" min={0} step="0.01" value={minCharge} onChange={(e) => setMinCharge(e.target.value)} />
            </Field>
          </div>

          <Field label="Takes effect" hint="Leave blank for now. A date in the future waits until then.">
            <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>

          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!valid}>
              Review
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Publish these rates?"
        danger
        requireText="PUBLISH"
        confirmLabel="Publish"
        body={
          <>
            B&W {money(Number(bw))} · Colour {money(Number(color))} · Minimum {money(Number(minCharge) || 0)} per page, for{' '}
            <strong className="text-ink">{describedScope}</strong>, from {effectiveFrom ? shortDate(effectiveFrom) : 'now'}. Customers are charged these
            rates from that moment.
          </>
        }
        onConfirm={async () => {
          await publish();
          onClose();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Attention: paid, not printed, and the refunds that follow
// ---------------------------------------------------------------------------

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
