'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { call, messageOf, qs, seg } from '../../lib/client/api';
import { useConsole, useResource } from '../../lib/client/console';
import { BUSINESS_MODELS, modelById, type BusinessModelId } from '../../lib/models';
import { actionLabel, count, dateTime, duration, money, percent, shortDate } from '../../lib/format';
import type { AuditEntry, Comparison, Organization, Range, Summary } from '../../lib/types';
import { DataTable, PageHeader, useToast } from '../ui/data';
import { ConfirmDialog, Modal } from '../ui/dialogs';
import { Button, Field, Input, KV, LinkButton, Loading, Notice, Panel, Pill, Stat, Tabs, Textarea, cx } from '../ui/primitives';
import { ModelPill, OrgPill, RawRecord } from './common';
import { RevenueSplitPanel } from './split';
import { BillingPanel } from './billing';
import { PartnerDocumentsPanel } from './onboarding';

// ---------------------------------------------------------------------------
// Frame: the header and tabs every partner page shares
// ---------------------------------------------------------------------------

const SECTIONS = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'model', label: 'Business model', path: '/model' },
  { key: 'staff', label: 'Staff', path: '/staff' },
  { key: 'qr-points', label: 'QR points', path: '/qr-points' },
  { key: 'printers', label: 'Printers', path: '/printers' },
  { key: 'money', label: 'Money', path: '/money' },
  { key: 'sessions', label: 'Sessions', path: '/sessions' },
  { key: 'pricing', label: 'Pricing', path: '/pricing' },
  { key: 'attention', label: 'Attention', path: '/attention' },
  { key: 'audit', label: 'Audit', path: '/audit' },
];

export function PartnerFrame({ orgId, children }: { orgId: string; children: ReactNode }) {
  const ctx = useConsole();
  const pathname = usePathname();
  const base = `/partners/${orgId}`;
  const org = ctx.organizations.find((o) => o.id === orgId);

  if (!ctx.ready) return <Loading label="Loading partner" />;

  if (!org) {
    return (
      <Notice tone="bad">
        No partner has the id <span className="font-mono">{orgId}</span>. It may have been deleted.{' '}
        <LinkButton href="/partners" size="sm">
          Back to partners
        </LinkButton>
      </Notice>
    );
  }

  const active = SECTIONS.find((s) => (s.path === '' ? pathname === base : pathname.startsWith(base + s.path)));

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Partners', href: '/partners' }, { label: org.name, href: base }]}
        title={org.name}
        meta={
          <>
            <OrgPill org={org} />
            <ModelPill id={org.businessModel} />
            <span className="font-mono text-[12px]">{org.slug}</span>
            <span className="font-mono text-[12px]" title={org.id}>
              {org.id}
            </span>
          </>
        }
      />
      <div className="mb-5">
        <Tabs items={SECTIONS.map((s) => ({ href: base + s.path, label: s.label, active: s === active }))} />
      </div>
      {children}
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
];

interface SummaryResponse {
  range: Range & { timezone: string };
  summary: Summary;
  comparison: Comparison | null;
}

export function PartnerOverviewView({ orgId }: { orgId: string }) {
  const ctx = useConsole();
  const router = useRouter();
  const toast = useToast();
  const [period, setPeriod] = useState('month');
  const [editing, setEditing] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const org = useResource<Organization>(`organizations/${seg(orgId)}`);
  const summary = useResource<SummaryResponse>(`reports/summary${qs({ organizationId: orgId, period })}`);
  const audit = useResource<{ total: number; entries: AuditEntry[] }>(`audit${qs({ organizationId: orgId, limit: 8 })}`);

  const record = org.data;
  if (!record) return org.error ? <Notice tone="bad">{org.error}</Notice> : <Loading />;

  const kiosks = ctx.kiosks.filter((k) => k.organizationId === orgId);
  const printers = ctx.printers.filter((p) => p.organization?.id === orgId);
  const stations = printers.filter((p) => p.station.isStation).length;
  const online = printers.filter((p) => p.status === 'online' || p.status === 'busy').length;
  const revoked = printers.filter((p) => Boolean(p.enrollment.revokedAt) || p.status === 'revoked').length;
  const staff = ctx.users.filter((u) => u.organizationId === orgId && !u.deletedAt);

  const refresh = () => {
    org.reload();
    summary.reload();
    audit.reload();
    ctx.reload();
  };

  const s = summary.data?.summary;
  const change = summary.data?.comparison?.change;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setEditing(true)}>Edit details</Button>
        {record.status === 'active' ? (
          <Button variant="danger" onClick={() => setSuspending(true)}>
            Suspend partner
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setSuspending(true)}>
            Reactivate partner
          </Button>
        )}
        <Button variant="danger" onClick={() => setDeleting(true)}>
          Delete partner
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Record" hint="Every field the platform holds for this partner" className="xl:col-span-2">
          <KV
            items={[
              { label: 'Name', value: record.name },
              { label: 'Status', value: <OrgPill org={record} /> },
              { label: 'Slug', value: record.slug, mono: true },
              { label: 'Partner ID', value: record.id, mono: true },
              { label: 'Business model (now)', value: <ModelPill id={record.businessModel} /> },
              { label: 'Timezone', value: record.timezone, mono: true },
              { label: 'Contact email', value: record.contactEmail, mono: true },
              { label: 'Contact phone', value: record.contactPhone, mono: true },
              { label: 'Joined', value: dateTime(record.createdAt, record.timezone) },
              { label: 'QR points', value: count(record.kioskCount ?? kiosks.length) },
              { label: 'Staff records (incl. removed)', value: count(record.adminCount ?? null) },
              { label: 'Notes', value: 'Write-only. The API does not return notes, so they cannot be shown here.', wide: true },
            ]}
          />
        </Panel>

        <Panel title="Fleet" hint="Live state, from the printers table">
          <KV
            columns={1}
            items={[
              { label: 'QR points', value: `${kiosks.length} (${kiosks.filter((k) => k.status === 'active').length} active)` },
              { label: 'Printers', value: `${printers.length}` },
              { label: 'Online or busy', value: `${online}` },
              { label: 'Stations (MPrnt-supplied)', value: `${stations}` },
              { label: 'Revoked', value: `${revoked}` },
              { label: 'Staff accounts', value: `${staff.length} not removed` },
            ]}
          />
        </Panel>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Performance</h2>
        <div className="flex items-center gap-2">
          <select
            aria-label="Period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-2xl border border-line bg-bg px-2.5 py-1.5 text-sm text-ink focus:border-brand-text focus:outline-none"
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      {summary.error && (
        <div className="mt-3">
          <Notice tone="bad">{summary.error}</Notice>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Revenue" value={money(s?.revenue)} sub={`${percent(change?.revenuePct ?? null)} vs previous`} />
        <Stat label="Paid jobs" value={count(s?.paidJobs)} sub={`${percent(change?.paidJobsPct ?? null)} vs previous`} />
        <Stat label="Printed" value={count(s?.completedJobs)} sub={`${count(s?.failedJobs)} failed`} />
        <Stat label="Fulfilment" value={s?.fulfilmentRate === null || s?.fulfilmentRate === undefined ? '—' : `${s.fulfilmentRate}%`} sub="Paid jobs that printed" />
        <Stat label="Pages charged" value={count(s?.pagesCharged)} sub={`${count(s?.pagesPrinted)} printed`} />
        <Stat label="Colour / B&W pages" value={`${count(s?.colorPages)} / ${count(s?.bwPages)}`} />
        <Stat label="Average order" value={money(s?.averageOrderValue)} />
        <Stat label="Average print time" value={duration(s?.avgPrintSeconds)} />
      </div>
      {summary.data && (
        <p className="mt-2 text-xs text-mute">
          {shortDate(summary.data.range.from, summary.data.range.timezone)} to {shortDate(summary.data.range.to, summary.data.range.timezone)} · {summary.data.range.timezone}
        </p>
      )}

      <div className="mt-4">
        <Panel
          title="Recent changes"
          hint="Every audited action on this partner, newest first"
          actions={<LinkButton href={`/partners/${orgId}/audit`} size="sm">Full audit</LinkButton>}
        >
          {audit.error && <Notice tone="bad">{audit.error}</Notice>}
          <DataTable
            caption="Recent audited actions"
            rows={audit.data?.entries ?? []}
            rowKey={(e) => e.id}
            empty="No changes recorded"
            columns={[
              { key: 'when', header: 'When', cell: (e) => dateTime(e.createdAt, record.timezone) },
              { key: 'action', header: 'Action', cell: (e) => actionLabel(e.action) },
              { key: 'by', header: 'By', cell: (e) => e.actor?.email ?? (e.actorScope === 'platform' ? 'Platform' : '—') },
              { key: 'ip', header: 'IP', mono: true, cell: (e) => e.ipAddress ?? '—' },
            ]}
          />
        </Panel>
      </div>

      <div className="mt-4">
        <RawRecord value={{ organization: record, summary: summary.data ?? null }} />
      </div>

      {editing && (
        <EditPartnerDialog
          org={record}
          onClose={() => setEditing(false)}
          onSaved={() => {
            toast('Partner details saved');
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={suspending}
        onClose={() => setSuspending(false)}
        title={record.status === 'active' ? 'Suspend this partner?' : 'Reactivate this partner?'}
        danger={record.status === 'active'}
        requireText={record.name}
        confirmLabel={record.status === 'active' ? 'Suspend' : 'Reactivate'}
        body={
          record.status === 'active' ? (
            <>
              Suspending blocks every staff account at {record.name} from signing in and stops its QR points taking new work. Live sessions are cut now.
              History is kept.
            </>
          ) : (
            <>Reactivating lets {record.name}&apos;s staff sign in again and its QR points take work.</>
          )
        }
        onConfirm={async () => {
          await call('POST', `organizations/${seg(orgId)}/status`, { status: record.status === 'active' ? 'suspended' : 'active' });
          toast(record.status === 'active' ? 'Partner suspended' : 'Partner reactivated');
          refresh();
        }}
      />

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this partner?"
        danger
        requireText={record.slug}
        confirmLabel="Delete partner"
        body={
          kiosks.length > 0 ? (
            <Notice tone="bad">
              This partner still has {kiosks.length} QR point{kiosks.length === 1 ? '' : 's'}. The platform refuses deletion while it does. Move or remove them
              first.
            </Notice>
          ) : (
            <>
              Deletion is a soft delete. The partner leaves every list, its staff are deactivated and signed out, and its history stays in the audit trail.
            </>
          )
        }
        onConfirm={async () => {
          await call('DELETE', `organizations/${seg(orgId)}`);
          toast('Partner deleted');
          router.push('/partners');
        }}
      />
    </>
  );
}

function EditPartnerDialog({ org, onClose, onSaved }: { org: Organization; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [timezone, setTimezone] = useState(org.timezone);
  const [contactEmail, setContactEmail] = useState(org.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(org.contactPhone ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();

    // Only changed fields are sent. Clearing a contact sends null, never an empty string.
    const patch: Record<string, unknown> = {};
    if (name.trim() !== org.name) patch.name = name.trim();
    if (timezone.trim() !== org.timezone) patch.timezone = timezone.trim();
    if ((contactEmail.trim() || null) !== (org.contactEmail || null)) patch.contactEmail = contactEmail.trim() || null;
    if ((contactPhone.trim() || null) !== (org.contactPhone || null)) patch.contactPhone = contactPhone.trim() || null;
    if (notes.trim()) patch.notes = notes.trim();

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await call('PATCH', `organizations/${seg(org.id)}`, patch);
      onSaved();
      onClose();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit partner details">
      <form className="space-y-4" onSubmit={save}>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={255} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Timezone" hint="IANA name, e.g. Asia/Kolkata">
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} maxLength={64} className="font-mono" />
          </Field>
          <Field label="Contact phone">
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={32} />
          </Field>
        </div>
        <Field label="Contact email">
          <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={255} />
        </Field>
        <Field label="Internal notes" hint="Write-only. Saving replaces the stored notes. Leave blank to keep them as they are.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Business model
// ---------------------------------------------------------------------------

export function PartnerModelView({ orgId }: { orgId: string }) {
  const toast = useToast();
  const ctx = useConsole();
  const org = useResource<Organization>(`organizations/${seg(orgId)}`);
  const created = useResource<{ total: number; entries: AuditEntry[] }>(
    `audit${qs({ organizationId: orgId, action: 'organization.created', limit: 5 })}`
  );
  const changes = useResource<{ total: number; entries: AuditEntry[] }>(
    `audit${qs({ organizationId: orgId, action: 'organization.model_changed', limit: 50 })}`
  );

  // null = nothing chosen yet; '' = "Not set" chosen explicitly.
  const [choice, setChoice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const record = org.data;
  if (!record) return org.error ? <Notice tone="bad">{org.error}</Notice> : <Loading />;

  const selected = choice ?? (record.businessModel ?? '');
  const target: BusinessModelId | null = selected === '' ? null : (selected as BusinessModelId);
  const changed = target !== (record.businessModel ?? null);

  const registrationEntry = created.data?.entries[created.data.entries.length - 1];
  const registrationRaw = registrationEntry?.details?.businessModel;
  const registrationId = typeof registrationRaw === 'string' ? registrationRaw : null;
  const registrationModel = modelById(registrationId);

  const printers = ctx.printers.filter((p) => p.organization?.id === orgId);
  const stations = printers.filter((p) => p.station.isStation).length;
  const ownPrinters = printers.length - stations;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="On now" hint="The partnership model in force today. Reporting and billing use this.">
          <div className="space-y-2">
            <ModelPill id={record.businessModel} />
            <p className="text-sm text-ink">{modelById(record.businessModel)?.name ?? 'No model has been recorded for this partner.'}</p>
            <p className="text-xs text-mute">{modelById(record.businessModel)?.summary ?? ''}</p>
          </div>
        </Panel>

        <Panel title="Chosen at registration" hint="Read from the audit entry written when the partner was created. It is not a separate field.">
          {created.error ? (
            <Notice tone="bad">{created.error}</Notice>
          ) : registrationEntry ? (
            <div className="space-y-2">
              <ModelPill id={registrationId} />
              <p className="text-sm text-ink">{registrationModel?.name ?? 'Not recorded when the partner was created'}</p>
              <p className="text-xs text-mute">
                Recorded {dateTime(registrationEntry.createdAt, record.timezone)}
                {registrationEntry.actor ? ` by ${registrationEntry.actor.email}` : ''}.
              </p>
            </div>
          ) : (
            <Notice tone="warn">No registration entry in the audit trail. The partner may predate the audit log.</Notice>
          )}
        </Panel>

        <Panel title="Fleet by family" hint="Printers this partner has, split by who supplied the hardware">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wider text-mute">MPrnt station</dt>
              <dd className="font-mono text-2xl text-ink">{stations}</dd>
            </div>
            <div className="rounded-2xl border border-line px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wider text-mute">Partner printer</dt>
              <dd className="font-mono text-2xl text-ink">{ownPrinters}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <Panel title="The four models" hint="The same definitions as the website's partner page">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {BUSINESS_MODELS.map((m) => {
            const isNow = record.businessModel === m.id;
            const isRegistered = registrationId === m.id;
            return (
              <article key={m.id} className={cx('rounded-2xl border p-3', isNow ? 'border-brand-text/60 bg-brand/5' : 'border-line')}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone="amber">{m.short}</Pill>
                  {isNow && <Pill tone="ok">On now</Pill>}
                  {isRegistered && <Pill tone="muted">At registration</Pill>}
                </div>
                <h3 className="mt-2 text-sm font-medium text-ink">{m.name}</h3>
                <p className="mt-1 text-xs text-mute">{m.summary}</p>
                <p className="mt-2 text-[11px] uppercase tracking-wider text-mute">{m.family}</p>
              </article>
            );
          })}
        </div>
      </Panel>

      <Panel title="Change the partnership model" hint="Every change is audited with the previous value. Past sessions and revenue are not altered.">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (changed) setConfirming(true);
          }}
        >
          <Field label="New model">
            <select
              value={selected}
              onChange={(e) => setChoice(e.target.value)}
              className="w-full md:min-w-[260px] rounded-2xl border border-line bg-bg px-2.5 py-2 text-sm text-ink focus:border-brand-text focus:outline-none"
            >
              <option value="">Not set</option>
              {BUSINESS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" variant="primary" disabled={!changed}>
            Review change
          </Button>
        </form>
      </Panel>

      <BillingPanel org={record} />

      <PartnerDocumentsPanel orgId={record.id} timezone={record.timezone} />

      <RevenueSplitPanel org={record} />

      <Panel title="Change history" hint="Each time the partnership model was changed, with the values before and after">
        {changes.error && <Notice tone="bad">{changes.error}</Notice>}
        <DataTable
          caption="Partnership model changes"
          rows={changes.data?.entries ?? []}
          rowKey={(e) => e.id}
          empty="The model has never been changed"
          columns={[
            { key: 'when', header: 'When', cell: (e) => dateTime(e.createdAt, record.timezone) },
            { key: 'from', header: 'From', cell: (e) => modelById(String(e.details?.from ?? ''))?.label ?? 'Not set' },
            { key: 'to', header: 'To', cell: (e) => modelById(String(e.details?.to ?? ''))?.label ?? 'Not set' },
            { key: 'by', header: 'By', cell: (e) => e.actor?.email ?? '—' },
          ]}
        />
      </Panel>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Change the partnership model?"
        danger
        requireText={record.name}
        confirmLabel="Change model"
        body={
          <>
            From <strong className="text-ink">{modelById(record.businessModel)?.label ?? 'Not set'}</strong> to{' '}
            <strong className="text-ink">{modelById(target)?.label ?? 'Not set'}</strong>. This is a commercial term, and the change is audited.
          </>
        }
        onConfirm={async () => {
          await call('PATCH', `organizations/${seg(orgId)}`, { businessModel: target });
          toast('Business model updated');
          setChoice(null);
          org.reload();
          changes.reload();
          created.reload();
          ctx.reload();
        }}
      />

      <RawRecord value={{ organization: record, registration: registrationEntry ?? null, changes: changes.data?.entries ?? [] }} />
    </div>
  );
}
