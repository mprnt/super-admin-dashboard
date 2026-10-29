'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useConsole, useResource } from '../../lib/client/console';
import { qs } from '../../lib/client/api';
import { ago, count, dateTime, money, percent, shortDate, actionLabel } from '../../lib/format';
import { partnerReadiness, type CheckKey } from '../../lib/readiness.ts';
import type { AttentionJob, AuditEntry, DraftSummary, Lead, OrgComparison, QueueStatus, SeriesPoint } from '../../lib/types';
import { DataTable, PageHeader } from '../ui/data';
import { Button, LinkButton, Notice, Panel, Pill, Segmented, Stat, StatusDot, cx } from '../ui/primitives';
import { ReadinessMeter, TrendBars } from '../ui/insight';
import { Icons } from '../ui/icons';
import { StatusPill, Id } from './common';

const PERIODS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
] as const;

type Period = (typeof PERIODS)[number]['value'];

const PERIOD_WORDS: Record<Period, string> = { day: 'today', week: 'this week', month: 'this month', year: 'this year' };

/** The short name of each readiness check, for chips and the gap summary. */
const SHORT: Record<CheckKey, string> = {
  contact: 'Contact',
  bank: 'Bank',
  upi: 'UPI',
  rates: 'Own rates',
  qr: 'QR point',
  printer: 'Printer',
  online: 'Online',
  owner: 'Owner',
};

/** How a count of partners missing one check reads in the gap summary. */
const GAP_PHRASE: Record<CheckKey, string> = {
  contact: 'without full contact details',
  bank: 'without a bank account',
  upi: 'without UPI',
  rates: 'on the MPRNT default rates',
  qr: 'without an active QR point',
  printer: 'without a printer',
  online: 'with no printer online',
  owner: 'without an owner account',
};

export function OverviewView() {
  const ctx = useConsole();
  const [period, setPeriod] = useState<Period>('month');

  const comparison = useResource<OrgComparison>(`reports/organizations${qs({ period })}`);
  const series = useResource<{ series: SeriesPoint[] }>(`reports/series${qs({ period })}`);
  const attention = useResource<{ count: number; jobs: AttentionJob[] }>('attention');
  const queue = useResource<QueueStatus>('queue/status');
  const audit = useResource<{ total: number; entries: AuditEntry[] }>(`audit${qs({ limit: 8 })}`);
  const leads = useResource<{ leads: Lead[]; pagination: { total: number } }>(`leads${qs({ limit: 5 })}`);
  const drafts = useResource<{ count: number; drafts: DraftSummary[] }>('onboarding/drafts');

  const orgs = ctx.organizations;
  const active = orgs.filter((o) => o.status === 'active').length;
  const suspended = orgs.length - active;

  const printers = ctx.printers.filter((p) => !p.enrollment.revokedAt && p.status !== 'revoked');
  const onlineNow = printers.filter((p) => (p.status === 'online' || p.status === 'busy') && !p.silent).length;

  const readiness = useMemo(() => {
    const data = { kiosks: ctx.kiosks, printers: ctx.printers, users: ctx.users, priceLists: ctx.priceLists };
    return orgs.map((org) => ({ org, r: partnerReadiness(org, data) }));
  }, [orgs, ctx.kiosks, ctx.printers, ctx.users, ctx.priceLists]);
  const readinessById = useMemo(() => new Map(readiness.map(({ org, r }) => [org.id, r])), [readiness]);
  const fullyReady = readiness.filter(({ r }) => r.done === r.total).length;
  const notReady = readiness
    .filter(({ r }) => r.done < r.total)
    .sort((a, b) => a.r.done - b.r.done || a.org.name.localeCompare(b.org.name));
  const gaps = (Object.keys(SHORT) as CheckKey[])
    .map((key) => ({ key, n: readiness.filter(({ r }) => r.missing.some((m) => m.key === key)).length }))
    .filter((g) => g.n > 0);

  const flagged = ctx.printers
    .filter((p) => (p.status !== 'online' && p.status !== 'busy') || p.silent || Boolean(p.enrollment.revokedAt))
    .sort((a, b) => Number(Boolean(b.enrollment.revokedAt)) - Number(Boolean(a.enrollment.revokedAt)))
    .slice(0, 8);

  const totals = comparison.data?.totals;
  const rows = comparison.data?.organizations ?? [];
  const fulfilment =
    totals && totals.current.paidJobs > 0 ? Math.round((totals.current.completedJobs / totals.current.paidJobs) * 1000) / 10 : null;

  function refreshAll() {
    ctx.reload();
    comparison.reload();
    series.reload();
    attention.reload();
    queue.reload();
    audit.reload();
    leads.reload();
    drafts.reload();
  }

  return (
    <>
      <PageHeader
        title="Platform overview"
        meta={
          <span>
            {count(orgs.length)} Model 1 partners · {count(ctx.kiosks.length)} QR points · {count(printers.length)} printers
          </span>
        }
        actions={
          <>
            <Segmented label="Period" value={period} options={PERIODS} onChange={setPeriod} />
            <Button size="sm" onClick={refreshAll}>
              <Icons.refresh className="h-4 w-4" />
              Refresh
            </Button>
          </>
        }
      />

      {/* The headline: money in, and how it moved across the period. */}
      <section className="overflow-hidden rounded-xl bg-side text-side-ink">
        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:p-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-side-mute">Revenue · {PERIOD_WORDS[period]}</p>
            <p className="tnum mt-2 text-[34px] font-semibold leading-none tracking-tight md:text-[40px]">{money(totals?.current.revenue)}</p>
            <p className="mt-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-side-mute">
              {totals ? (
                <>
                  <span
                    className={cx(
                      'rounded-md px-1.5 py-0.5 text-[11.5px] font-bold',
                      (totals.change.revenuePct ?? 0) >= 0 ? 'bg-accent/20 text-accent' : 'bg-bad/25 text-[rgb(255,190,180)]'
                    )}
                  >
                    {percent(totals.change.revenuePct)}
                  </span>
                  vs the previous period
                </>
              ) : (
                'Loading…'
              )}
            </p>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
              <HeroFigure label="Paid jobs" value={count(totals?.current.paidJobs)} />
              <HeroFigure label="Printed" value={count(totals?.current.completedJobs)} />
              <HeroFigure label="Fulfilment" value={fulfilment === null ? '—' : `${fulfilment}%`} />
            </dl>
          </div>
          <div className="min-h-[150px] min-w-0">
            {series.error ? (
              <p className="text-[12.5px] text-side-mute">{series.error}</p>
            ) : (
              <TrendBars
                points={(series.data?.series ?? []).map((p) => ({ label: shortDate(p.date), value: p.revenue }))}
                format={(v) => money(v)}
              />
            )}
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Partners" value={count(orgs.length)} sub={`${count(active)} active · ${count(suspended)} suspended`} tone={suspended ? 'warn' : undefined} />
        <Stat
          label="Fully ready"
          value={`${count(fullyReady)} / ${count(orgs.length)}`}
          sub={`${count(orgs.length - fullyReady)} missing something`}
          tone={fullyReady < orgs.length ? 'warn' : 'ok'}
        />
        <Stat label="QR points" value={count(ctx.kiosks.length)} sub={`${count(ctx.kiosks.filter((k) => k.status === 'active').length)} active`} />
        <Stat
          label="Printers online"
          value={`${count(onlineNow)} / ${count(printers.length)}`}
          sub={`${count(printers.length - onlineNow)} offline or silent`}
          tone={printers.length - onlineNow > 0 ? 'warn' : undefined}
        />
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

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel
          title="Partner readiness"
          hint="What each partner still lacks to take paid jobs and be paid. Least ready first."
          actions={<LinkButton href="/partners" size="sm">All partners</LinkButton>}
          flush
        >
          {gaps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3 md:px-5">
              {gaps.map((g) => (
                <span key={g.key} className="inline-flex items-center gap-1.5 rounded-md bg-raised px-2 py-1 text-[12px] text-ink">
                  <span className="tnum font-bold">{g.n}</span>
                  <span className="text-mute">{GAP_PHRASE[g.key]}</span>
                </span>
              ))}
            </div>
          )}
          {notReady.length === 0 ? (
            <div className="p-4 md:p-5">
              <Notice tone="ok">Every partner has everything it needs.</Notice>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {notReady.slice(0, 10).map(({ org, r }) => (
                <li key={org.id}>
                  <Link href={`/partners/${org.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-brand-soft/40 md:px-5">
                    <span className="min-w-0 flex-1 basis-40">
                      <span className="block truncate text-[13.5px] font-semibold text-ink group-hover:text-brand-text">{org.name}</span>
                      <span className="block truncate text-[12px] text-mute">{org.contactEmail ?? 'No contact email'}</span>
                    </span>
                    <ReadinessMeter readiness={r} />
                    <span className="flex basis-full flex-wrap gap-1 md:basis-auto md:justify-end">
                      {r.missing.slice(0, 4).map((m) => (
                        <Pill key={m.key} tone="bad">
                          {SHORT[m.key]}
                        </Pill>
                      ))}
                      {r.missing.length > 4 && <Pill tone="muted">+{r.missing.length - 4}</Pill>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {notReady.length > 10 && (
            <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-mute md:px-5">
              {count(notReady.length - 10)} more partners are missing something. They are all on the Partners page.
            </p>
          )}
        </Panel>

        <Panel
          title="Onboarding in progress"
          hint="Partners whose sign-up was started and not finished. A draft lapses after 7 days without changes."
          actions={<LinkButton href="/partners/new" size="sm">New partner</LinkButton>}
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
          <ul className="divide-y divide-line">
            {(drafts.data?.drafts ?? []).slice(0, 8).map((d) => (
              <li key={d.id}>
                <DraftRow draft={d} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title={`Partners by revenue · ${PERIOD_WORDS[period]}`} hint="Every Model 1 partner, ranked by what it took." flush>
          {comparison.error && (
            <div className="p-4">
              <Notice tone="bad">{comparison.error}</Notice>
            </div>
          )}
          <div className="p-3 md:p-4">
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
                {
                  key: 'ready',
                  header: 'Readiness',
                  cell: (r) => {
                    const rd = readinessById.get(r.organization.id);
                    return rd ? <ReadinessMeter readiness={rd} /> : '—';
                  },
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
          </div>
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

        <Panel title="Printers that need a look" hint="Offline, silent or revoked. Revoked first." actions={<LinkButton href="/printers" size="sm">All printers</LinkButton>} flush>
          {flagged.length === 0 ? (
            <div className="p-4 md:p-5">
              <Notice tone="ok">Every printer is online or busy.</Notice>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {flagged.map((p) => {
                const revoked = Boolean(p.enrollment.revokedAt) || p.status === 'revoked';
                return (
                  <li key={p.printerId}>
                    <Link
                      href={p.organization ? `/partners/${p.organization.id}/printers/${encodeURIComponent(p.printerId)}` : '/printers'}
                      className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-brand-soft/40 md:px-5"
                    >
                      <StatusDot tone={revoked ? 'bad' : 'warn'} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{p.station.label}</span>
                        <span className="block truncate text-[12px] text-mute">
                          {p.organization?.name ?? 'Unassigned'} · {p.kiosk.code} · {p.printerId}
                        </span>
                      </span>
                      <Pill tone={revoked ? 'bad' : 'warn'}>{revoked ? 'revoked' : p.silent ? 'silent' : p.status}</Pill>
                    </Link>
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
          <p className="mt-3 text-[12px] text-mute">{count(leads.data?.pagination.total ?? null)} enquiries in total.</p>
        </Panel>
      </div>
    </>
  );
}

function HeroFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase leading-tight tracking-[0.06em] text-side-mute">{label}</dt>
      <dd className="tnum mt-1 truncate text-[18px] font-semibold">{value}</dd>
    </div>
  );
}

const STEPS: { key: keyof DraftSummary['steps']; label: string }[] = [
  { key: 'business', label: 'Business' },
  { key: 'qrPoint', label: 'QR point' },
  { key: 'owner', label: 'Owner' },
  { key: 'payout', label: 'Bank or UPI' },
];

/** One partner being onboarded: who, how far the wizard got, and when the draft lapses. */
export function DraftRow({ draft }: { draft: DraftSummary }) {
  const updatedSeconds = Math.max(0, Math.round((Date.now() - new Date(draft.updatedAt).getTime()) / 1000));
  const lapsesInDays = Math.max(0, Math.ceil((new Date(draft.expiresAt).getTime() - Date.now()) / 86_400_000));
  const done = STEPS.filter((s) => draft.steps[s.key]).length;
  return (
    <Link href={`/partners/new?draft=${draft.id}`} className="group block px-4 py-3 transition hover:bg-brand-soft/40 md:px-5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink group-hover:text-brand-text">
          {draft.tradingName ?? 'Untitled draft'}
          {draft.city && <span className="font-normal text-mute"> · {draft.city}</span>}
        </span>
        <Pill tone={lapsesInDays <= 1 ? 'bad' : lapsesInDays <= 3 ? 'warn' : 'muted'}>
          {lapsesInDays === 0 ? 'Lapses today' : `Lapses in ${lapsesInDays} d`}
        </Pill>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span aria-hidden className="flex flex-1 gap-1">
          {STEPS.map((s) => (
            <span key={s.key} title={s.label} className={cx('h-1.5 flex-1 rounded-full', draft.steps[s.key] ? 'bg-brand-text' : 'bg-line-strong')} />
          ))}
        </span>
        <span className="tnum shrink-0 text-[11.5px] font-semibold text-mute">
          {done}/{STEPS.length} steps
        </span>
        <span className="sr-only">Done: {STEPS.filter((s) => draft.steps[s.key]).map((s) => s.label).join(', ') || 'nothing yet'}.</span>
      </div>
      <p className="mt-1.5 truncate text-[12px] text-mute">
        {draft.ownerEmail ?? 'No owner yet'} · {draft.documents} document{draft.documents === 1 ? '' : 's'} · updated {ago(updatedSeconds)}
        {draft.createdBy ? ` by ${draft.createdBy}` : ''}
      </p>
    </Link>
  );
}

