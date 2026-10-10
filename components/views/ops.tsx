'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { call, messageOf, qs } from '../../lib/client/api';
import { useConsole, useResource } from '../../lib/client/console';
import { actionLabel, count, dateTime } from '../../lib/format';
import type { AdminRole, AuditEntry, Lead, PermissionCatalogue, QueueStatus } from '../../lib/types';
import { DataTable, PageHeader, useToast } from '../ui/data';
import { Button, Field, Input, KV, Notice, Panel, Pill, Select, Stat, cx } from '../ui/primitives';
import { Modal } from '../ui/dialogs';
import { ROLE_LABEL, RawRecord, roleTone } from './common';

const PAGE = 50;

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export function AuditView({ orgId }: { orgId?: string }) {
  const ctx = useConsole();
  const [action, setAction] = useState('');
  const [category, setCategory] = useState<'all' | 'security'>('all');
  const [actorScope, setActorScope] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<AuditEntry | null>(null);

  const actions = useResource<{ actions: string[] }>('audit/actions');
  const org = orgId ? ctx.organizations.find((o) => o.id === orgId) : null;

  const path = `audit${qs({
    organizationId: orgId,
    action: action || undefined,
    category,
    actorScope: orgId ? undefined : actorScope || undefined,
    from: from || undefined,
    to: to || undefined,
    limit: PAGE,
    offset,
  })}`;
  const audit = useResource<{ total: number; entries: AuditEntry[] }>(path);

  const total = audit.data?.total ?? 0;

  return (
    <>
      <PageHeader
        crumbs={org ? [{ label: 'Partners', href: '/partners' }, { label: org.name, href: `/partners/${org.id}` }] : undefined}
        title={orgId ? 'Audit' : 'Audit trail'}
        meta={<span>Every administrative action, who took it, and from which address. Entries are never edited or deleted.</span>}
        actions={
          <Button size="sm" onClick={audit.reload}>
            Refresh
          </Button>
        }
      />

      <Panel>
        <div className="mb-4 grid gap-3 md:grid-cols-5">
          <Field label="Action">
            <Select value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }}>
              <option value="">Any action</option>
              {(actions.data?.actions ?? []).map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Show">
            <Select value={category} onChange={(e) => { setCategory(e.target.value as 'all' | 'security'); setOffset(0); }}>
              <option value="all">Everything</option>
              <option value="security">Security events only</option>
            </Select>
          </Field>
          {!orgId && (
            <Field label="Actor">
              <Select value={actorScope} onChange={(e) => { setActorScope(e.target.value); setOffset(0); }}>
                <option value="">Platform and partner staff</option>
                <option value="platform">Platform only</option>
                <option value="shop">Partner staff only</option>
              </Select>
            </Field>
          )}
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setOffset(0); }} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setOffset(0); }} />
          </Field>
        </div>

        {audit.error && <div className="mb-3"><Notice tone="bad">{audit.error}</Notice></div>}

        <DataTable
          caption="Audit entries"
          rows={audit.data?.entries ?? []}
          rowKey={(e) => e.id}
          empty={audit.loading ? 'Loading…' : 'No entries match these filters'}
          onRowClick={(e) => setDetail(e)}
          columns={[
            { key: 'when', header: 'When', cell: (e: AuditEntry) => dateTime(e.createdAt, org?.timezone) },
            {
              key: 'action',
              header: 'Action',
              cell: (e: AuditEntry) => (
                <span className="block">
                  <span className="block text-ink">{actionLabel(e.action)}</span>
                  <span className="block font-mono text-xs text-mute">{e.action}</span>
                </span>
              ),
            },
            {
              key: 'by',
              header: 'By',
              cell: (e: AuditEntry) =>
                e.actor ? (
                  <span className="block">
                    <span className="block break-all text-ink">{e.actor.email}</span>
                    <Pill tone={roleTone(e.actor.role as AdminRole)}>{ROLE_LABEL[e.actor.role as AdminRole] ?? e.actor.role}</Pill>
                  </span>
                ) : (
                  <span className="text-mute">{e.actorScope === 'platform' ? 'Platform' : 'Removed account'}</span>
                ),
            },
            ...(orgId ? [] : [{ key: 'org', header: 'Partner', cell: (e: AuditEntry) => e.organization?.name ?? '—' }]),
            {
              key: 'on',
              header: 'On',
              cell: (e: AuditEntry) => (
                <span className="block text-xs text-mute">
                  {e.resourceType ?? '—'}
                  {e.resourceId && <span className="block font-mono">{e.resourceId.slice(0, 13)}…</span>}
                </span>
              ),
            },
            { key: 'ip', header: 'IP', mono: true, hideMobile: true, cell: (e: AuditEntry) => e.ipAddress ?? '—' },
          ]}
        />

        <Pager offset={offset} total={total} onOffset={setOffset} />
      </Panel>

      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail ? actionLabel(detail.action) : ''}>
        {detail && (
          <div className="space-y-5">
            <KV
              columns={1}
              items={[
                { label: 'When', value: dateTime(detail.createdAt, org?.timezone) },
                { label: 'Action (raw)', value: detail.action, mono: true },
                { label: 'By', value: detail.actor ? `${detail.actor.email} · ${detail.actor.role}` : detail.actorScope },
                { label: 'Partner', value: detail.organization?.name ?? 'Platform' },
                { label: 'On', value: detail.resourceType ? `${detail.resourceType} · ${detail.resourceId ?? ''}` : null, mono: true },
                { label: 'IP address', value: detail.ipAddress, mono: true },
              ]}
            />
            <pre className="max-h-64 overflow-auto rounded-2xl bg-raised p-4 font-mono text-[12px] leading-relaxed text-ink">
              {JSON.stringify(detail.details ?? {}, null, 2)}
            </pre>
          </div>
        )}
      </Modal>
    </>
  );
}

function Pager({ offset, total, onOffset }: { offset: number; total: number; onOffset: (n: number) => void }) {
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + PAGE, total);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-mute">
      <span>
        {first}–{last} of {count(total)}
      </span>
      <div className="flex gap-2">
        <Button size="sm" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - PAGE))}>
          Previous
        </Button>
        <Button size="sm" disabled={offset + PAGE >= total} onClick={() => onOffset(offset + PAGE)}>
          Next
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Print queue, across every partner
// ---------------------------------------------------------------------------

export function QueueView() {
  const queue = useResource<QueueStatus>('queue/status');

  // Live enough for an operator to watch a backlog clear, without a page reload.
  const { reload } = queue;
  useEffect(() => {
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  const q = queue.data?.queue;
  return (
    <>
      <PageHeader
        title="Print queue"
        meta={<span>Jobs routed to printers in the last 24 hours. Refreshes every 30 seconds.{queue.data ? ` Last read ${dateTime(queue.data.timestamp)}.` : ''}</span>}
        actions={
          <Button size="sm" onClick={queue.reload}>
            Refresh
          </Button>
        }
      />
      {queue.error && <div className="mb-4"><Notice tone="bad">{queue.error}</Notice></div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Queued" value={count(q?.queued)} tone={q && q.queued > 0 ? 'warn' : undefined} />
        <Stat label="Assigned" value={count(q?.assigned)} />
        <Stat label="Printing" value={count(q?.printing)} />
        <Stat label="Completed" value={count(q?.completed)} />
        <Stat label="Failed" value={count(q?.failed)} tone={q && q.failed > 0 ? 'bad' : undefined} />
      </div>
      <p className="mt-4 text-sm text-mute">
        Failed jobs are listed on the <a className="text-ink underline-offset-2 hover:text-brand-text hover:underline" href="/attention">Attention</a> page with their
        error, and a paid one can be refunded from there.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Leads from the website
// ---------------------------------------------------------------------------

export function LeadsView() {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const leads = useResource<{ leads: Lead[]; pagination: { total: number } }>(`leads${qs({ limit: PAGE, offset })}`);
  const total = leads.data?.pagination.total ?? 0;

  return (
    <>
      <PageHeader title="Leads" meta={<span>Contact-form enquiries from the website. Newest first.</span>} actions={<Button size="sm" onClick={leads.reload}>Refresh</Button>} />
      <Panel>
        {leads.error && <div className="mb-3"><Notice tone="bad">{leads.error}</Notice></div>}
        <DataTable
          caption="Leads"
          rows={leads.data?.leads ?? []}
          rowKey={(l) => l.id}
          empty={leads.loading ? 'Loading…' : 'No enquiries yet'}
          onRowClick={(l) => setOpen(open === l.id ? null : l.id)}
          columns={[
            { key: 'when', header: 'Received', cell: (l) => dateTime(l.createdAt) },
            { key: 'name', header: 'Name', cell: (l) => l.name },
            { key: 'email', header: 'Email', mono: true, cell: (l) => l.email },
            { key: 'company', header: 'Company', cell: (l) => l.company || '—' },
            { key: 'phone', header: 'Phone', mono: true, cell: (l) => l.phone || '—' },
            { key: 'source', header: 'Source', cell: (l) => l.source },
            { key: 'msg', header: 'Message', cell: (l) => <span className={cx('line-clamp-2 max-w-md', open === l.id ? 'whitespace-pre-wrap' : '')}>{l.message}</span> },
          ]}
        />
        <Pager offset={offset} total={total} onOffset={setOffset} />
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Permissions: what each role can do
// ---------------------------------------------------------------------------

const PLATFORM_ONLY = new Set(['orgs:read', 'orgs:write', 'pricing:write', 'platform:reports', 'audit:read_all']);

export function PermissionsView() {
  const cat = useResource<PermissionCatalogue>('permissions');
  const roles = cat.data?.roles ?? [];
  const order = ['viewer', 'manager', 'owner', 'super_admin'] as const;

  return (
    <>
      <PageHeader title="Permissions" meta={<span>What each role may do. A person can have one permission added or removed on their own page.</span>} />
      <Panel>
        {cat.error && <div className="mb-3"><Notice tone="bad">{cat.error}</Notice></div>}
        <DataTable
          caption="Permissions by role"
          rows={cat.data?.permissions ?? []}
          rowKey={(p) => p}
          empty={cat.loading ? 'Loading…' : 'No permissions loaded'}
          columns={[
            { key: 'perm', header: 'Permission', mono: true, cell: (p: string) => p },
            ...order.map((r) => ({
              key: r,
              header: ROLE_LABEL[r],
              align: 'right' as const,
              cell: (p: string) => {
                const has = roles.find((x) => x.role === r)?.permissions.includes(p) ?? false;
                return has ? <span className="font-semibold text-ok">Yes</span> : <span className="text-mute">No</span>;
              },
            })),
            {
              key: 'who',
              header: 'Who it applies to',
              cell: (p: string) => (PLATFORM_ONLY.has(p) ? <Pill tone="amber">Platform only · not for shop staff</Pill> : 'Partner staff'),
            },
          ]}
        />
        <p className="mt-4 text-xs text-mute">
          Platform accounts are created on the command line and cannot be edited here. Partner staff can be granted or denied single permissions on their
          own page, and every change ends their sessions.
        </p>
      </Panel>
      {cat.data && <RawRecord value={cat.data} label="Catalogue" />}
    </>
  );
}

// ---------------------------------------------------------------------------
// My account: change my own password
// ---------------------------------------------------------------------------

export function AccountView() {
  const me = useResource<{ id: string; email: string; role: string; permissions: string[]; organization: null }>('auth/me');
  const toast = useToast();
  const [first, setFirst] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFirst(new URLSearchParams(window.location.search).get('first') === '1');
  }, []);

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 12;
  const same = next.length > 0 && next === current;
  const ready = current.length > 0 && next.length >= 12 && next === confirm && !same;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await call('POST', 'auth/change-password', { currentPassword: current, newPassword: next });
      toast('Password changed. Signing you out…');
      // The backend asks for a fresh sign-in after a change, so the session ends here.
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
      window.location.assign('/login?notice=changed');
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="My account" meta={<span>{me.data?.email ?? 'Loading…'}</span>} />

      {first && (
        <div className="mb-4">
          <Notice tone="warn">
            Your password is temporary. Set your own before you go anywhere else. Pick at least 12 characters.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Change password" hint="Changing it signs you out everywhere, so you sign in again with the new one." className="xl:col-span-2">
          <form className="max-w-md space-y-4" onSubmit={submit}>
            <Field label="Current password">
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label="New password" hint="At least 12 characters. Length matters more than symbols." error={tooShort ? 'Too short' : same ? 'Must differ from the current password' : null}>
              <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={12} />
            </Field>
            <Field label="Confirm new password" error={mismatch ? 'Does not match' : null}>
              <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </Field>
            {error && <Notice tone="bad">{error}</Notice>}
            <Button type="submit" variant="primary" disabled={!ready || busy}>
              {busy ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        </Panel>

        <Panel title="Account" hint="As the platform records it">
          {me.data ? (
            <dl className="space-y-3 text-sm">
              <div><dt className="text-[11px] uppercase tracking-wider text-mute">Email</dt><dd className="font-mono text-ink">{me.data.email}</dd></div>
              <div><dt className="text-[11px] uppercase tracking-wider text-mute">Role</dt><dd><Pill tone="amber">{ROLE_LABEL.super_admin}</Pill></dd></div>
              <div><dt className="text-[11px] uppercase tracking-wider text-mute">Permissions</dt><dd className="text-ink">{me.data.permissions.length} granted</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-mute">{me.error ?? 'Loading…'}</p>
          )}
        </Panel>
      </div>

      {me.data && <div className="mt-4"><RawRecord value={me.data} label="Session profile" /></div>}
    </>
  );
}
