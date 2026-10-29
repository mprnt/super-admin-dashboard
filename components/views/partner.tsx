'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { call, messageOf, qs, seg } from '../../lib/client/api';
import { useConsole, useResource } from '../../lib/client/console';
import { actionLabel, count, dateTime, duration, money, percent, shortDate } from '../../lib/format';
import type { AuditEntry, Comparison, Organization, PriceList, Range, Summary } from '../../lib/types';
import { partnerReadiness } from '../../lib/readiness.ts';
import { DataTable, PageHeader, useToast } from '../ui/data';
import { ConfirmDialog, Modal } from '../ui/dialogs';
import { Button, Eyebrow, Field, Input, KV, LinkButton, Loading, Notice, Panel, Pill, Stat, Tabs, Textarea, cx } from '../ui/primitives';
import { ReadinessChecklist, ReadinessMeter } from '../ui/insight';
import { OrgPill, RawRecord } from './common';
import { BillingPanel } from './billing';
import { PartnerDocumentsPanel } from './onboarding';

// ---------------------------------------------------------------------------
// Frame: the header and tabs every partner page shares
// ---------------------------------------------------------------------------

const SECTIONS = [
  { key: 'overview', label: 'Overview', path: '' },
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
        No Model 1 partner has the id <span className="font-mono">{orgId}</span>. It may have been deleted, or it may be on another model.{' '}
        <LinkButton href="/partners" size="sm">
          Back to partners
        </LinkButton>
      </Notice>
    );
  }

  const active = SECTIONS.find((s) => (s.path === '' ? pathname === base : pathname.startsWith(base + s.path)));

  const kiosks = ctx.kiosks.filter((k) => k.organizationId === orgId);
  const printers = ctx.printers.filter((p) => p.organization?.id === orgId && !p.enrollment.revokedAt && p.status !== 'revoked');
  const online = printers.filter((p) => (p.status === 'online' || p.status === 'busy') && !p.silent).length;
  const staff = ctx.users.filter((u) => u.organizationId === orgId && !u.deletedAt);
  const ownRate = ctx.priceLists.find((p) => p.organizationId === orgId && !p.kioskId) ?? null;
  const readiness = partnerReadiness(org, { kiosks: ctx.kiosks, printers: ctx.printers, users: ctx.users, priceLists: ctx.priceLists });
  const payoutReady = Boolean(org.payout.upiId || org.payout.bankAccountLast4);
  const owner = staff
    .filter((u) => u.role === 'owner')
    .sort((a, b) => (b.lastLoginAt ?? '').localeCompare(a.lastLoginAt ?? ''))[0];
  const initials = org.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  const counts: Record<string, number | null> = {
    staff: staff.length,
    'qr-points': kiosks.length,
    printers: printers.length,
  };

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-[12.5px] text-mute">
        <Link href="/partners" className="font-medium hover:text-brand-text">
          Partners
        </Link>
        <span aria-hidden className="mx-1.5 text-line-strong">›</span>
        <span className="text-ink/80">{org.name}</span>
      </nav>

      <section className="mb-5 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex flex-wrap items-start gap-4 p-4 md:p-5">
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand text-[17px] font-bold text-brand-ink">
            {initials || '·'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 break-words text-[21px] font-semibold leading-tight tracking-tight text-ink md:text-[24px]">{org.name}</h1>
              <OrgPill org={org} />
              <Pill tone="amber">Model 1 · Printer integration</Pill>
            </div>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-mute">
              <span className="font-mono">{org.slug}</span>
              <span className="font-mono" title={org.id}>
                {org.id.slice(0, 8)}…
              </span>
              <span>Joined {shortDate(org.createdAt, org.timezone)}</span>
              <span>{org.contactEmail ?? 'No contact email'}</span>
            </p>
          </div>
          <Link
            href={`${base}`}
            className="flex shrink-0 items-center gap-3 rounded-lg border border-line px-3 py-2 transition hover:border-line-strong"
            title={readiness.missing.length ? `Missing: ${readiness.missing.map((m) => m.label).join(', ')}` : 'Everything in place'}
          >
            <Eyebrow>Readiness</Eyebrow>
            <ReadinessMeter readiness={readiness} />
          </Link>
        </div>

        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 xl:grid-cols-6 [&>div]:bg-surface [&>div]:px-4 [&>div]:py-3 md:[&>div]:px-5">
          <Fact label="QR points" value={`${kiosks.filter((k) => k.status === 'active').length} / ${kiosks.length}`} sub="active / total" />
          <Fact label="Printers online" value={`${online} / ${printers.length}`} sub="online / enrolled" tone={printers.length > 0 && online === 0 ? 'bad' : undefined} />
          <Fact label="Staff" value={count(staff.length)} sub={`${staff.filter((u) => u.role === 'owner').length} owner`} />
          <Fact
            label="Rates"
            value={ownRate ? `${money(ownRate.bwPerPage)} · ${money(ownRate.colorPerPage)}` : 'Default'}
            sub={ownRate ? 'B&W · colour, set by the shop' : 'On the MPRNT default'}
            tone={ownRate ? undefined : 'warn'}
          />
          <Fact
            label="Payout"
            value={payoutReady ? (org.payout.upiId ? 'UPI' : 'Bank') + (org.payout.upiId && org.payout.bankAccountLast4 ? ' + bank' : '') : 'Missing'}
            sub={org.payout.bankAccountLast4 ? `Account ending ${org.payout.bankAccountLast4}` : org.payout.upiId ?? 'No bank or UPI on file'}
            tone={payoutReady ? undefined : 'bad'}
          />
          <Fact
            label="Owner last in"
            value={owner?.lastLoginAt ? shortDate(owner.lastLoginAt, org.timezone) : owner ? 'Never' : 'No owner'}
            sub={owner?.email ?? 'No owner account'}
            tone={!owner ? 'bad' : !owner.lastLoginAt ? 'warn' : undefined}
          />
        </dl>

        <div className="border-t border-line px-2 md:px-3">
          <Tabs items={SECTIONS.map((s) => ({ href: base + s.path, label: s.label, active: s === active, count: counts[s.key] ?? undefined }))} />
        </div>
      </section>
      {children}
    </>
  );
}

function Fact({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-mute">{label}</dt>
      <dd className={cx('tnum mt-1 text-[16px] font-semibold leading-snug', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink')}>{value}</dd>
      {sub && <dd className="mt-0.5 text-[11.5px] leading-snug text-mute">{sub}</dd>}
    </div>
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
  const online = printers.filter((p) => p.status === 'online' || p.status === 'busy').length;
  const revoked = printers.filter((p) => Boolean(p.enrollment.revokedAt) || p.status === 'revoked').length;
  const staff = ctx.users.filter((u) => u.organizationId === orgId && !u.deletedAt);
  const readiness = partnerReadiness(record, { kiosks: ctx.kiosks, printers: ctx.printers, users: ctx.users, priceLists: ctx.priceLists });

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
              { label: 'Timezone', value: record.timezone, mono: true },
              { label: 'Joined', value: dateTime(record.createdAt, record.timezone) },
              { label: 'QR points', value: count(record.kioskCount ?? kiosks.length) },
              { label: 'Staff records (incl. removed)', value: count(record.adminCount ?? null) },
              { label: 'Notes', value: 'Write-only. The API does not return notes, so they cannot be shown here.', wide: true },
            ]}
          />
        </Panel>

        <Panel
          title="Readiness"
          hint={`${readiness.done} of ${readiness.total} in place. Each line opens where it is seen or fixed.`}
          actions={<ReadinessMeter readiness={readiness} />}
        >
          <ReadinessChecklist readiness={readiness} base={`/partners/${orgId}`} />
          <p className="mt-3 text-[12px] text-mute">
            {printers.length} printer{printers.length === 1 ? '' : 's'} enrolled · {online} online or busy · {revoked} revoked · {staff.length} staff
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ShopkeeperPanel record={record} onChanged={refresh} />
        <RatesPanel orgId={orgId} timezone={record.timezone} />
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

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BillingPanel org={record} />
        <PartnerDocumentsPanel orgId={record.id} timezone={record.timezone} />
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
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();

    // Only changed fields are sent. Clearing a contact sends null, never an empty string.
    const patch: Record<string, unknown> = {};
    if (name.trim() !== org.name) patch.name = name.trim();
    if (timezone.trim() !== org.timezone) patch.timezone = timezone.trim();
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
        <Field label="Timezone" hint="IANA name, e.g. Asia/Kolkata. Contact and bank details are under Shopkeeper details.">
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} maxLength={64} className="font-mono" />
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
// Shopkeeper details: contact, bank and UPI. The shop can set these itself; the
// platform can set them too, and the source of each is shown.
// ---------------------------------------------------------------------------

/** Who set a detail, and when. Nothing added yet shows as a warning, so a gap is visible. */
function SourceChip({ source, at, timezone }: { source: 'platform' | 'shop' | null; at: string | null; timezone: string }) {
  if (!source) return <Pill tone="warn">Not added yet</Pill>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Pill tone={source === 'shop' ? 'ok' : 'muted'}>{source === 'shop' ? 'Added by the shop' : 'Added by MPRNT'}</Pill>
      {at && <span className="text-xs text-mute">{dateTime(at, timezone)}</span>}
    </span>
  );
}

function ShopkeeperPanel({ record, onChanged }: { record: Organization; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const payout = record.payout;
  const missing = 'Not added yet';

  return (
    <Panel
      title="Shopkeeper details"
      hint="Contact, bank and UPI. The shop adds or changes these from its own dashboard, or MPRNT adds them here."
      actions={
        <Button size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      }
    >
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-ink">Contact</h3>
            <SourceChip source={record.contactUpdatedBy} at={record.contactUpdatedAt} timezone={record.timezone} />
          </div>
          <KV
            columns={2}
            items={[
              { label: 'Email', value: record.contactEmail ?? missing, mono: true },
              { label: 'Phone', value: record.contactPhone ?? missing, mono: true },
            ]}
          />
        </section>
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-ink">Bank account and UPI</h3>
            <SourceChip source={payout.updatedBy} at={payout.updatedAt} timezone={record.timezone} />
          </div>
          <KV
            columns={2}
            items={[
              { label: 'Account holder', value: payout.bankAccountHolder ?? missing },
              { label: 'Bank', value: payout.bankName ?? missing },
              { label: 'IFSC', value: payout.bankIfsc ?? missing, mono: true },
              { label: 'Account number', value: payout.bankAccountLast4 ? `ending ${payout.bankAccountLast4}` : missing, mono: true },
              { label: 'UPI ID', value: payout.upiId ?? missing, mono: true, wide: true },
            ]}
          />
        </section>
      </div>

      {editing && (
        <EditShopkeeperDialog
          record={record}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </Panel>
  );
}

/**
 * Sets the shop's contact and bank details from the platform side. Only what changed is
 * sent. The account number is typed afresh each time: leaving it blank keeps the saved one.
 */
function EditShopkeeperDialog({ record, onClose, onSaved }: { record: Organization; onClose: () => void; onSaved: () => void }) {
  const payout = record.payout;
  const [contactEmail, setContactEmail] = useState(record.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(record.contactPhone ?? '');
  const [holder, setHolder] = useState(payout.bankAccountHolder ?? '');
  const [bankName, setBankName] = useState(payout.bankName ?? '');
  const [ifsc, setIfsc] = useState(payout.bankIfsc ?? '');
  const [accountNumber, setAccountNumber] = useState('');
  const [upi, setUpi] = useState(payout.upiId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const digits = accountNumber.replace(/\s+/g, '');
    if (digits && !/^[0-9]{6,18}$/.test(digits)) return setError('An account number is 6 to 18 digits.');
    if (ifsc.trim() && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc.trim())) return setError('An IFSC code is 11 characters, for example HDFC0001234.');
    if (upi.trim() && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(upi.trim())) {
      return setError('A UPI ID looks like name@bank, for example sharma@hdfc.');
    }

    const contact: Record<string, unknown> = {};
    if ((contactEmail.trim() || null) !== (record.contactEmail || null)) contact.contactEmail = contactEmail.trim() || null;
    if ((contactPhone.trim() || null) !== (record.contactPhone || null)) contact.contactPhone = contactPhone.trim() || null;

    // An empty value is sent as empty, which clears the saved detail.
    const bank: Record<string, unknown> = {};
    if (holder.trim() !== (payout.bankAccountHolder ?? '')) bank.bankAccountHolder = holder.trim();
    if (bankName.trim() !== (payout.bankName ?? '')) bank.bankName = bankName.trim();
    if (ifsc.trim().toUpperCase() !== (payout.bankIfsc ?? '')) bank.bankIfsc = ifsc.trim().toUpperCase();
    if (upi.trim() !== (payout.upiId ?? '')) bank.upiId = upi.trim();
    if (digits) bank.bankAccountNumber = digits;

    if (Object.keys(contact).length === 0 && Object.keys(bank).length === 0) {
      onClose();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (Object.keys(contact).length > 0) await call('PATCH', `organizations/${seg(record.id)}`, contact);
      if (Object.keys(bank).length > 0) await call('PATCH', `organizations/${seg(record.id)}/payout`, bank);
      onSaved();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit shopkeeper details">
      <form className="space-y-5" onSubmit={save}>
        <fieldset className="space-y-4">
          <legend className="mb-1 text-sm font-medium text-ink">Contact</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email">
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={255} />
            </Field>
            <Field label="Phone">
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={32} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-sm font-medium text-ink">Bank account and UPI</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account holder">
              <Input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={255} />
            </Field>
            <Field label="Bank">
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={255} />
            </Field>
            <Field label="IFSC" hint="11 characters, for example HDFC0001234">
              <Input value={ifsc} onChange={(e) => setIfsc(e.target.value)} maxLength={11} className="font-mono uppercase" />
            </Field>
            <Field
              label="Account number"
              hint={payout.bankAccountLast4 ? `Leave blank to keep the saved account, ending ${payout.bankAccountLast4}.` : 'Digits only.'}
            >
              <Input
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                maxLength={24}
                className="font-mono"
                autoComplete="off"
              />
            </Field>
          </div>
          <Field label="UPI ID" hint="For example sharma@hdfc">
            <Input value={upi} onChange={(e) => setUpi(e.target.value)} maxLength={256} className="font-mono" />
          </Field>
        </fieldset>

        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Rates: what the shop charges. Read only here; the shop sets its own rates.
// ---------------------------------------------------------------------------

function RatesPanel({ orgId, timezone }: { orgId: string; timezone: string }) {
  const lists = useResource<{ priceLists: PriceList[] }>('pricing/lists');
  const all = lists.data?.priceLists ?? [];
  // The API lists the newest rate first, so the first match is the rate in force.
  const shopRate = all.find((p) => p.organizationId === orgId && !p.kioskId) ?? null;
  const platform = all.find((p) => p.scope === 'platform') ?? null;

  return (
    <Panel title="Rates" hint="Black-and-white and colour per page, as the shop has set them. Read only here.">
      {lists.error && <Notice tone="bad">{lists.error}</Notice>}
      {shopRate ? (
        <KV
          columns={2}
          items={[
            { label: 'Black and white, per page', value: money(shopRate.bwPerPage), mono: true },
            { label: 'Colour, per page', value: money(shopRate.colorPerPage), mono: true },
            { label: 'Set by', value: shopRate.createdBy === 'platform' ? 'MPRNT' : 'The shop' },
            { label: 'In force since', value: dateTime(shopRate.effectiveFrom, timezone) },
            {
              label: 'MPRNT default',
              value: platform ? `${money(platform.bwPerPage)} B&W · ${money(platform.colorPerPage)} colour` : 'Not set',
              wide: true,
            },
          ]}
        />
      ) : (
        <Notice tone="warn">
          The shop has not set its own rates. Its customers pay the MPRNT default
          {platform ? ` (${money(platform.bwPerPage)} black and white, ${money(platform.colorPerPage)} colour)` : ''} until it does.
        </Notice>
      )}
      <p className="mt-3 text-xs text-mute">Rates are changed from the shop&apos;s own dashboard. They are never edited here.</p>
    </Panel>
  );
}
