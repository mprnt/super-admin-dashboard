'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { call, messageOf, qs } from '../../lib/client/api';
import { useConsole, useResource } from '../../lib/client/console';
import { BUSINESS_MODELS, type BusinessModelId } from '../../lib/models';
import { count, dateTime, money, percent, shortDate } from '../../lib/format';
import type { OrgComparison, Organization } from '../../lib/types';
import { DataTable, PageHeader, useToast } from '../ui/data';
import { Modal } from '../ui/dialogs';
import { Button, Field, Input, LinkButton, Notice, Panel, Pill, Select, Stat, Textarea } from '../ui/primitives';
import { ModelPill, OrgPill, RawRecord, orgTone } from './common';

// ---------------------------------------------------------------------------
// Partner directory
// ---------------------------------------------------------------------------

export function PartnersView() {
  const ctx = useConsole();
  const toast = useToast();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [model, setModel] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ctx.organizations
      .filter((o) => !status || o.status === status)
      .filter((o) => !model || (model === 'none' ? !o.businessModel : o.businessModel === model))
      .filter((o) => !needle || `${o.name} ${o.slug} ${o.id} ${o.contactEmail ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ctx.organizations, q, status, model]);

  const printersFor = (orgId: string) => ctx.printers.filter((p) => p.organization?.id === orgId).length;

  return (
    <>
      <PageHeader
        title="Partners"
        meta={<span>{count(ctx.organizations.length)} partners on the platform</span>}
        actions={<LinkButton href="/partners/new" variant="primary">New partner</LinkButton>}
      />

      <Panel>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_220px]">
          <Field label="Search">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, slug, email or ID" type="search" />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </Select>
          </Field>
          <Field label="Business model">
            <Select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">All</option>
              {BUSINESS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.name}
                </option>
              ))}
              <option value="none">Not recorded</option>
            </Select>
          </Field>
        </div>

        <DataTable
          caption="Partners"
          rows={rows}
          rowKey={(o) => o.id}
          empty={q || status || model ? 'No partner matches these filters' : 'No partners yet'}
          rowHref={(o) => `/partners/${o.id}`}
          columns={[
            { key: 'name', header: 'Partner', cell: (o) => o.name },
            { key: 'slug', header: 'Slug', mono: true, cell: (o) => o.slug },
            { key: 'status', header: 'Status', cell: (o) => <OrgPill org={o} /> },
            { key: 'model', header: 'Model', cell: (o) => <ModelPill id={o.businessModel} /> },
            { key: 'qr', header: 'QR points', align: 'right', cell: (o) => count(o.kioskCount ?? 0) },
            { key: 'printers', header: 'Printers', align: 'right', cell: (o) => count(printersFor(o.id)) },
            { key: 'staff', header: 'Staff', align: 'right', cell: (o) => count(o.adminCount ?? 0) },
            { key: 'tz', header: 'Timezone', mono: true, cell: (o) => o.timezone },
            { key: 'joined', header: 'Joined', cell: (o) => shortDate(o.createdAt, o.timezone) },
          ]}
        />
      </Panel>

    </>
  );
}

export function BusinessModelsView() {
  const ctx = useConsole();
  const orgs = ctx.organizations;

  const groups: { id: BusinessModelId | null; label: string; name: string; summary: string; partners: Organization[] }[] = [
    ...BUSINESS_MODELS.map((m) => ({ id: m.id, label: m.label, name: m.name, summary: m.summary, partners: orgs.filter((o) => o.businessModel === m.id) })),
    {
      id: null,
      label: 'Not recorded',
      name: 'No model on file',
      summary: 'Partners created before the model was recorded. Set one on the partner\'s Business model page.',
      partners: orgs.filter((o) => !o.businessModel),
    },
  ];

  return (
    <>
      <PageHeader title="Business models" meta={<span>Who is on which commercial model, across the platform</span>} />

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Panel
            key={g.id ?? 'none'}
            title={
              <span className="flex items-center gap-2">
                {g.label}
                <span className="text-mute font-normal">· {g.name}</span>
              </span>
            }
            hint={g.summary}
            actions={<span className="font-mono text-lg text-ink">{g.partners.length}</span>}
          >
            {g.partners.length === 0 ? (
              <p className="text-sm text-mute">No partners on this model.</p>
            ) : (
              <ul className="divide-y divide-line">
                {g.partners.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                    <LinkButton href={`/partners/${o.id}/model`} size="sm" variant="ghost">
                      {o.name}
                    </LinkButton>
                    <Pill tone={orgTone(o.status)} dot>
                      {o.status}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))}
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
            { key: 'model', header: 'Model', cell: (r) => <ModelPill id={r.organization.businessModel} /> },
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
