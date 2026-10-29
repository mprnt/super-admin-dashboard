'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useConsole, useResource } from '../../lib/client/console';
import { qs } from '../../lib/client/api';
import { ago, count, dateTime, money, percent, actionLabel } from '../../lib/format';
import type { AttentionJob, AuditEntry, Lead, OrgComparison, QueueStatus } from '../../lib/types';
import { DataTable, PageHeader } from '../ui/data';
import { Button, LinkButton, Notice, Panel, Pill, Select, Stat, StatusDot } from '../ui/primitives';
import { StatusPill, Id } from './common';

const PERIODS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

export function OverviewView() {
  const ctx = useConsole();
  const [period, setPeriod] = useState('month');

  const comparison = useResource<OrgComparison>(`reports/organizations${qs({ period })}`);
  const attention = useResource<{ count: number; jobs: AttentionJob[] }>('attention');
  const queue = useResource<QueueStatus>('queue/status');
  const audit = useResource<{ total: number; entries: AuditEntry[] }>(`audit${qs({ limit: 8 })}`);
  const leads = useResource<{ leads: Lead[]; pagination: { total: number } }>(`leads${qs({ limit: 5 })}`);

  const orgs = ctx.organizations;
  const active = orgs.filter((o) => o.status === 'active').length;
  const suspended = orgs.length - active;

  const printers = ctx.printers;
  const online = printers.filter((p) => p.status === 'online').length;
  const busy = printers.filter((p) => p.status === 'busy').length;
  const offline = printers.filter((p) => p.status === 'offline' && !p.enrollment.revokedAt).length;
  const revoked = printers.filter((p) => p.enrollment.revokedAt || p.status === 'revoked').length;

  const staff = ctx.users.filter((u) => !u.deletedAt);
  const staffActive = staff.filter((u) => u.isActive).length;

  const flagged = printers
    .filter((p) => (p.status !== 'online' && p.status !== 'busy') || p.silent || Boolean(p.enrollment.revokedAt))
    .sort((a, b) => Number(Boolean(b.enrollment.revokedAt)) - Number(Boolean(a.enrollment.revokedAt)))
    .slice(0, 8);

  const totals = comparison.data?.totals;
  const rows = comparison.data?.organizations ?? [];

  function refreshAll() {
    ctx.reload();
    comparison.reload();
    attention.reload();
    queue.reload();
    audit.reload();
    leads.reload();
  }

  return (
    <>
      <PageHeader
        title="Platform overview"
        meta={<span>Every partner, QR point, printer and person, live.</span>}
        actions={
          <>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period" className="w-auto min-w-[140px]">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={refreshAll}>
              Refresh
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Partners" value={count(orgs.length)} sub={`${count(active)} active · ${count(suspended)} suspended`} tone={suspended ? 'warn' : undefined} />
        <Stat label="QR points" value={count(ctx.kiosks.length)} sub={`${count(ctx.kiosks.filter((k) => k.status === 'active').length)} active`} />
        <Stat
          label="Printers online"
          value={`${count(online + busy)} / ${count(printers.length)}`}
          sub={`${count(busy)} busy · ${count(offline)} offline · ${count(revoked)} revoked`}
          tone={offline + revoked > 0 ? 'warn' : undefined}
        />
        <Stat label="Staff accounts" value={count(staffActive)} sub={`${count(staff.length)} in total`} />
        <Stat
          label={`Revenue · ${PERIODS.find((p) => p.value === period)?.label.toLowerCase()}`}
          value={money(totals?.current.revenue)}
          sub={totals ? `${percent(totals.change.revenuePct)} vs previous` : 'Loading…'}
        />
        <Stat label="Paid jobs" value={count(totals?.current.paidJobs)} sub={totals ? `${count(totals.current.completedJobs)} printed` : undefined} />
        <Stat
          label="Needs attention"
          value={count(attention.data?.count)}
          sub="Paid but not printed"
          tone={attention.data && attention.data.count > 0 ? 'bad' : undefined}
        />
        <Stat
          label="Print queue · 24h"
          value={count(queue.data?.queue.queued ?? null)}
          sub={queue.data ? `${count(queue.data.queue.printing)} printing · ${count(queue.data.queue.failed)} failed` : 'Loading…'}
          tone={queue.data && queue.data.queue.failed > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4">
        <Panel
          title="Partners"
          hint="Model 1 partners, ranked by revenue this period"
          actions={<LinkButton href="/partners" size="sm">All partners</LinkButton>}
        >
          {comparison.error && <Notice tone="bad">{comparison.error}</Notice>}
          <DataTable
            caption="Partners ranked by revenue this period"
            rows={rows}
            rowKey={(r) => r.organization.id}
            empty="No partners yet"
            columns={[
              { key: 'name', header: 'Partner', cell: (r) => r.organization.name },
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
              { key: 'paid', header: 'Paid jobs', align: 'right', cell: (r) => count(r.current.paidJobs) },
              { key: 'fleet', header: 'Printers', align: 'right', cell: (r) => `${r.printersOnline} / ${r.printersTotal}` },
              {
                key: 'last',
                header: 'Last paid',
                cell: (r) => (r.daysSinceLastPaid === null ? 'Never' : `${r.daysSinceLastPaid} d ago`),
              },
            ]}
            rowHref={(r) => `/partners/${r.organization.id}`}
          />
        </Panel>

      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel
          title="Needs attention"
          hint="Paid jobs that have not printed. Each one is a refund waiting to happen."
          actions={<LinkButton href="/attention" size="sm">All</LinkButton>}
        >
          {attention.error && <Notice tone="bad">{attention.error}</Notice>}
          <DataTable
            caption="Paid jobs that have not printed"
            rows={(attention.data?.jobs ?? []).slice(0, 8)}
            rowKey={(j) => j.jobId}
            empty="Nothing waiting. Every paid job has printed."
            columns={[
              { key: 'job', header: 'Job', cell: (j) => <Id value={j.jobId} /> },
              { key: 'kiosk', header: 'QR point', cell: (j) => j.kiosk.code },
              { key: 'amount', header: 'Amount', align: 'right', cell: (j) => money(j.amount) },
              { key: 'age', header: 'Waiting', cell: (j) => ago(j.ageSeconds) },
              { key: 'status', header: 'Status', cell: (j) => <StatusPill status={j.status} /> },
              {
                key: 'refund',
                header: 'Refund due',
                cell: (j) => (j.refundCandidate ? <Pill tone="bad">Yes</Pill> : <Pill tone="muted">Not yet</Pill>),
              },
            ]}
          />
        </Panel>

        <Panel title="Printers that need a look" hint="Offline, silent or revoked. Revoked comes first.">
          {flagged.length === 0 ? (
            <Notice tone="ok">Every printer is online or busy.</Notice>
          ) : (
            <ul className="divide-y divide-line">
              {flagged.map((p) => {
                const revoked = Boolean(p.enrollment.revokedAt) || p.status === 'revoked';
                return (
                  <li key={p.printerId} className="flex items-center gap-3 py-2.5">
                    <StatusDot tone={revoked ? 'bad' : 'warn'} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={p.organization ? `/partners/${p.organization.id}/printers/${encodeURIComponent(p.printerId)}` : '/printers'}
                        className="flex min-h-[44px] items-center truncate text-[15px] text-ink hover:text-brand-text"
                      >
                        {p.station.label}
                      </Link>
                      <div className="truncate text-xs text-mute">
                        {p.organization?.name ?? 'Unassigned'} · {p.kiosk.code} · {p.printerId}
                      </div>
                    </div>
                    <Pill tone={revoked ? 'bad' : 'warn'}>{revoked ? 'revoked' : p.silent ? 'silent' : p.status}</Pill>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Recent platform activity" hint="The last eight entries in the audit trail." actions={<LinkButton href="/audit" size="sm">Full trail</LinkButton>}>
          {audit.error && <Notice tone="bad">{audit.error}</Notice>}
          <DataTable
            caption="Latest audit entries"
            rows={audit.data?.entries ?? []}
            rowKey={(e) => e.id}
            empty="No activity recorded yet"
            columns={[
              { key: 'time', header: 'When', cell: (e) => dateTime(e.createdAt) },
              { key: 'action', header: 'Action', cell: (e) => actionLabel(e.action) },
              { key: 'actor', header: 'By', cell: (e) => e.actor?.email ?? (e.actorScope === 'platform' ? 'Platform' : '—') },
              { key: 'org', header: 'Partner', cell: (e) => e.organization?.name ?? '—' },
            ]}
          />
        </Panel>

        <Panel title="Latest enquiries" hint="Contact-form leads from the website." actions={<LinkButton href="/leads" size="sm">All leads</LinkButton>}>
          {leads.error && <Notice tone="bad">{leads.error}</Notice>}
          <DataTable
            caption="Latest leads"
            rows={leads.data?.leads ?? []}
            rowKey={(l) => l.id}
            empty="No enquiries yet"
            columns={[
              { key: 'name', header: 'Name', cell: (l) => l.name },
              { key: 'company', header: 'Company', cell: (l) => l.company || '—' },
              { key: 'when', header: 'Received', cell: (l) => dateTime(l.createdAt) },
              { key: 'message', header: 'Message', cell: (l) => <span className="line-clamp-1 max-w-xs text-mute">{l.message}</span> },
            ]}
          />
          <p className="mt-3 text-xs text-mute">{count(leads.data?.pagination.total ?? null)} enquiries in total.</p>
        </Panel>
      </div>
    </>
  );
}
