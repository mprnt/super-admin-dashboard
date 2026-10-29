'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { call, messageOf, qs } from '../../lib/client/api';
import { useConsole, useResource } from '../../lib/client/console';
import { count, dateTime, money, percent, shortDate } from '../../lib/format';
import type { DraftSummary, OrgComparison, Organization } from '../../lib/types';
import { partnerReadiness, type CheckKey } from '../../lib/readiness.ts';
import { ReadinessMeter } from '../ui/insight';
import { DraftRow } from './overview';
import { DataTable, PageHeader, useToast } from '../ui/data';
import { Modal } from '../ui/dialogs';
import { Button, Field, Input, LinkButton, Notice, Panel, Pill, Segmented, Select, Stat, Textarea } from '../ui/primitives';
import { OrgPill, RawRecord, orgTone } from './common';

// ---------------------------------------------------------------------------
// Partner directory
// ---------------------------------------------------------------------------

const READINESS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'gaps', label: 'Missing something' },
  { value: 'payout', label: 'No bank or UPI' },
  { value: 'rates', label: 'On default rates' },
  { value: 'offline', label: 'No printer online' },
  { value: 'ready', label: 'Fully ready' },
] as const;

type ReadinessFilter = (typeof READINESS_FILTERS)[number]['value'];

export function PartnersView() {
  const ctx = useConsole();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [show, setShow] = useState<ReadinessFilter>('all');
  const drafts = useResource<{ count: number; drafts: DraftSummary[] }>('onboarding/drafts');

  const readiness = useMemo(() => {
    const data = { kiosks: ctx.kiosks, printers: ctx.printers, users: ctx.users, priceLists: ctx.priceLists };
    return new Map(ctx.organizations.map((o) => [o.id, partnerReadiness(o, data)]));
  }, [ctx.organizations, ctx.kiosks, ctx.printers, ctx.users, ctx.priceLists]);

  const missing = (orgId: string, key: CheckKey) => readiness.get(orgId)?.missing.some((m) => m.key === key) ?? false;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ctx.organizations
      .filter((o) => !status || o.status === status)
      .filter((o) => !needle || `${o.name} ${o.slug} ${o.id} ${o.contactEmail ?? ''} ${o.contactPhone ?? ''}`.toLowerCase().includes(needle))
      .filter((o) => {
        const r = readiness.get(o.id);
        if (!r || show === 'all') return true;
        if (show === 'gaps') return r.done < r.total;
        if (show === 'ready') return r.done === r.total;
        if (show === 'payout') return missing(o.id, 'bank') && missing(o.id, 'upi');
        if (show === 'rates') return missing(o.id, 'rates');
        return missing(o.id, 'online');
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    // missing reads readiness, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.organizations, q, status, show, readiness]);

  const printersFor = (orgId: string) => {
    const live = ctx.printers.filter((p) => p.organization?.id === orgId && !p.enrollment.revokedAt && p.status !== 'revoked');
    const on = live.filter((p) => (p.status === 'online' || p.status === 'busy') && !p.silent).length;
    return { live: live.length, on };
  };
  const rateFor = (orgId: string) => ctx.priceLists.find((p) => p.organizationId === orgId && !p.kioskId) ?? null;

  return (
    <>
      <PageHeader
        title="Partners"
        meta={<span>{count(ctx.organizations.length)} Model 1 partners · {count(rows.length)} shown</span>}
        actions={<LinkButton href="/partners/new" variant="primary">New partner</LinkButton>}
      />

      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-line p-4 md:p-5 xl:flex-row xl:items-end">
          <div className="grid flex-1 gap-3 md:grid-cols-[1fr_180px]">
            <Field label="Search">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, slug, email, phone or ID" type="search" />
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </Select>
            </Field>
          </div>
          <div className="min-w-0">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-ink">Show</span>
            <Segmented label="Show partners" value={show} options={READINESS_FILTERS} onChange={setShow} />
          </div>
        </div>

        <div className="p-3 md:p-4">
          <DataTable
            caption="Partners"
            rows={rows}
            rowKey={(o) => o.id}
            empty={q || status || show !== 'all' ? 'No partner matches these filters' : 'No partners yet'}
            rowHref={(o) => `/partners/${o.id}`}
            columns={[
              { key: 'name', header: 'Partner', cell: (o) => o.name },
              { key: 'status', header: 'Status', cell: (o) => <OrgPill org={o} /> },
              {
                key: 'ready',
                header: 'Readiness',
                cell: (o) => {
                  const r = readiness.get(o.id);
                  return r ? <ReadinessMeter readiness={r} /> : '—';
                },
              },
              {
                key: 'contact',
                header: 'Contact',
                cell: (o) => (
                  <span className="block max-w-[220px]">
                    <span className="block truncate">{o.contactEmail ?? <span className="text-bad">No email</span>}</span>
                    <span className="block truncate text-[12px] text-mute">{o.contactPhone ?? 'No phone'}</span>
                  </span>
                ),
              },
              {
                key: 'payout',
                header: 'Payout',
                cell: (o) =>
                  o.payout.upiId || o.payout.bankAccountLast4 ? (
                    <span className="flex flex-wrap gap-1">
                      {o.payout.upiId && <Pill tone="ok">UPI</Pill>}
                      {o.payout.bankAccountLast4 && <Pill tone="ok">Bank ·{o.payout.bankAccountLast4}</Pill>}
                    </span>
                  ) : (
                    <Pill tone="bad">Missing</Pill>
                  ),
              },
              {
                key: 'rates',
                header: 'B&W · colour',
                cell: (o) => {
                  const r = rateFor(o.id);
                  return r ? (
                    <span className="tnum">
                      {money(r.bwPerPage)} · {money(r.colorPerPage)}
                    </span>
                  ) : (
                    <Pill tone="warn">Default</Pill>
                  );
                },
              },
              { key: 'qr', header: 'QR points', align: 'right', cell: (o) => count(o.kioskCount ?? 0) },
              {
                key: 'printers',
                header: 'Printers on',
                align: 'right',
                cell: (o) => {
                  const p = printersFor(o.id);
                  return <span className={p.live > 0 && p.on === 0 ? 'font-semibold text-bad' : undefined}>{`${p.on} / ${p.live}`}</span>;
                },
              },
              { key: 'staff', header: 'Staff', align: 'right', cell: (o) => count(o.adminCount ?? 0) },
              { key: 'joined', header: 'Joined', cell: (o) => shortDate(o.createdAt, o.timezone) },
            ]}
          />
        </div>
      </Panel>

      <div className="mt-4">
        <Panel
          title="Onboarding in progress"
          hint="Sign-ups that were started and not finished. Open one to carry on where it stopped."
          actions={<LinkButton href="/partners/new" size="sm">Start a new one</LinkButton>}
          flush
        >
          {drafts.error && (
            <div className="p-4">
              <Notice tone="bad">{drafts.error}</Notice>
            </div>
          )}
          {drafts.data && drafts.data.drafts.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-mute md:px-5">No partner is being onboarded right now.</p>
          )}
          <ul className="grid divide-y divide-line md:grid-cols-2 md:divide-y-0 md:[&>li]:border-b md:[&>li]:border-line md:[&>li:nth-child(odd)]:border-r">
            {(drafts.data?.drafts ?? []).map((d) => (
              <li key={d.id}>
                <DraftRow draft={d} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Partner comparison (platform reports)
// ---------------------------------------------------------------------------

const PERIODS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

export function ReportsView() {
  const [period, setPeriod] = useState('month');
  const report = useResource<OrgComparison>(`reports/organizations${qs({ period })}`);
  const data = report.data;

  return (
    <>
      <PageHeader
        title="Partner comparison"
        meta={<span>Every partner side by side for one period. Revenue counts paid jobs only.</span>}
        actions={
          <>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period" className="w-auto min-w-[150px]">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={report.reload}>
              Refresh
            </Button>
          </>
        }
      />

      {report.error && (
        <div className="mb-4">
          <Notice tone="bad">{report.error}</Notice>
        </div>
      )}

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="Platform revenue" value={money(data.totals.current.revenue)} sub={`${percent(data.totals.change.revenuePct)} vs previous`} />
          <Stat label="Paid jobs" value={count(data.totals.current.paidJobs)} sub={`${percent(data.totals.change.paidJobsPct)} vs previous`} />
          <Stat label="Pages" value={count(data.totals.current.pages)} sub={`${percent(data.totals.change.pagesPct)} vs previous`} />
          <Stat label="Inactive after" value={`${data.inactiveAfterDays} days`} sub="Without a paid job" />
        </div>
      )}

      <Panel title="Partners" hint="Ranked by revenue in the period. Change is against the previous period of the same length.">
        <DataTable
          caption="Partner comparison for the period"
          rows={data?.organizations ?? []}
          rowKey={(r) => r.organization.id}
          empty={report.loading ? 'Loading…' : 'No partners yet'}
          rowHref={(r) => `/partners/${r.organization.id}`}
          columns={[
            { key: 'name', header: 'Partner', cell: (r) => r.organization.name },
            { key: 'status', header: 'Status', cell: (r) => <OrgPill org={r.organization} /> },
            {
              key: 'activity',
              header: 'Activity',
              cell: (r) => (
                <Pill tone={r.activity === 'active' ? 'ok' : r.activity === 'suspended' ? 'bad' : r.activity === 'new' ? 'amber' : 'warn'} dot>
                  {r.activity}
                </Pill>
              ),
            },
            { key: 'rev', header: 'Revenue', align: 'right', cell: (r) => money(r.current.revenue) },
            { key: 'revchg', header: 'vs prev', align: 'right', cell: (r) => percent(r.change.revenuePct) },
            { key: 'paid', header: 'Paid jobs', align: 'right', cell: (r) => count(r.current.paidJobs) },
            { key: 'failed', header: 'Failed', align: 'right', cell: (r) => count(r.current.failedJobs) },
            { key: 'pages', header: 'Pages', align: 'right', cell: (r) => count(r.current.pages) },
            { key: 'ful', header: 'Fulfilment', align: 'right', cell: (r) => (r.fulfilmentRate === null ? '—' : `${r.fulfilmentRate}%`) },
            { key: 'qr', header: 'QR points', align: 'right', cell: (r) => count(r.kiosks) },
            { key: 'fleet', header: 'Printers online', align: 'right', cell: (r) => `${r.printersOnline} / ${r.printersTotal}` },
            { key: 'last', header: 'Last paid', cell: (r) => (r.lastPaidAt ? dateTime(r.lastPaidAt, r.organization.timezone) : 'Never') },
          ]}
        />
        {data && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 md:grid-cols-5">
            <Total label="Revenue" value={money(data.totals.current.revenue)} prev={money(data.totals.previous.revenue)} />
            <Total label="Paid jobs" value={count(data.totals.current.paidJobs)} prev={count(data.totals.previous.paidJobs)} />
            <Total label="Completed" value={count(data.totals.current.completedJobs)} prev={count(data.totals.previous.completedJobs)} />
            <Total label="Failed" value={count(data.totals.current.failedJobs)} prev={count(data.totals.previous.failedJobs)} />
            <Total label="Pages" value={count(data.totals.current.pages)} prev={count(data.totals.previous.pages)} />
          </div>
        )}
      </Panel>

      {data && <RawRecord value={data} label="Comparison" />}
    </>
  );
}

function Total({ label, value, prev }: { label: string; value: string; prev: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-mute">{label} · total</div>
      <div className="font-mono text-lg text-ink">{value}</div>
      <div className="text-xs text-mute">previous {prev}</div>
    </div>
  );
}
