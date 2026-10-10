'use client';

import { useEffect, useState, Fragment, type FormEvent } from 'react';
import { call, messageOf, qs } from '../../lib/client/api';
import { useConsole, useResource } from '../../lib/client/console';
import { actionLabel, count, dateTime } from '../../lib/format';
import type { AdminRole, AuditEntry, Lead, PermissionCatalogue, QueueStatus } from '../../lib/types';
import { DataTable, PageHeader, useToast } from '../ui/data';
import { Button, Field, Input, Notice, Panel, Pill, Select, Stat, cx } from '../ui/primitives';
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
  const [open, setOpen] = useState<Set<string>>(() => new Set());

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
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">Audit entries</caption>
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-mute">
                <th scope="col" className="px-2.5 py-2 font-medium">When</th>
                <th scope="col" className="px-2.5 py-2 font-medium">Action</th>
                <th scope="col" className="px-2.5 py-2 font-medium">By</th>
                {!orgId && <th scope="col" className="px-2.5 py-2 font-medium">Partner</th>}
                <th scope="col" className="px-2.5 py-2 font-medium">On</th>
                <th scope="col" className="px-2.5 py-2 font-medium">IP</th>
                <th scope="col" className="px-2.5 py-2 font-medium"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody>
              {(audit.data?.entries ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2.5 py-8 text-center text-sm text-mute">
                    {audit.loading ? 'Loading…' : 'No entries match these filters'}
                  </td>
                </tr>
              )}
              {(audit.data?.entries ?? []).map((e) => {
                const expanded = open.has(e.id);
                return (
                  <Fragment key={e.id}>
                    <tr className="border-b border-line/60 align-top hover:bg-raised/60">
                      <td className="whitespace-nowrap px-2.5 py-2.5 text-ink">{dateTime(e.createdAt, org?.timezone)}</td>
                      <td className="px-2.5 py-2.5">
                        <div className="text-ink">{actionLabel(e.action)}</div>
                        <div className="font-mono text-[11px] text-mute">{e.action}</div>
                      </td>
                      <td className="px-2.5 py-2.5">
                        {e.actor ? (
                          <>
                            <div className="text-ink">{e.actor.email}</div>
                            <Pill tone={roleTone(e.actor.role as AdminRole)}>{ROLE_LABEL[e.actor.role as AdminRole] ?? e.actor.role}</Pill>
                          </>
                        ) : (
                          <span className="text-mute">{e.actorScope === 'platform' ? 'Platform' : 'Removed account'}</span>
                        )}
                      </td>
                      {!orgId && <td className="px-2.5 py-2.5 text-ink">{e.organization?.name ?? '—'}</td>}
                      <td className="px-2.5 py-2.5 text-xs text-mute">
                        {e.resourceType ?? '—'}
                        {e.resourceId && <div className="font-mono text-[11px]">{e.resourceId.slice(0, 13)}…</div>}
                      </td>
                      <td className="px-2.5 py-2.5 font-mono text-[12px] text-mute">{e.ipAddress ?? '—'}</td>
                      <td className="px-2.5 py-2.5 text-right">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => toggle(e.id)}
                          className="rounded border border-line px-2 py-1 text-xs text-mute hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
                        >
                          {expanded ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-line/60 bg-bg">
                        <td colSpan={7} className="px-2.5 py-3">
                          <pre className="max-h-64 overflow-auto rounded border border-line bg-surface p-3 font-mono text-[12px] text-ink">
                            {JSON.stringify(
                              { id: e.id, action: e.action, resourceType: e.resourceType, resourceId: e.resourceId, actor: e.actor, organization: e.organization, details: e.details, ipAddress: e.ipAddress, createdAt: e.createdAt },
                              null,
                              2
                            )}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pager offset={offset} total={total} onOffset={setOffset} />
      </Panel>
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
        Failed jobs are listed on the <a className="text-ink underline-offset-2 hover:text-amber hover:underline" href="/attention">Attention</a> page with their
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
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Permissions by role</caption>
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-mute">
                <th scope="col" className="px-2.5 py-2 font-medium">Permission</th>
                {order.map((r) => (
                  <th key={r} scope="col" className="px-2.5 py-2 text-center font-medium">
                    {ROLE_LABEL[r]}
                  </th>
                ))}
                <th scope="col" className="px-2.5 py-2 font-medium">Who it applies to</th>
              </tr>
            </thead>
            <tbody>
              {(cat.data?.permissions ?? []).map((p) => (
                <tr key={p} className="border-b border-line/60">
                  <td className="px-2.5 py-2 font-mono text-[13px] text-ink">{p}</td>
                  {order.map((r) => {
                    const has = roles.find((x) => x.role === r)?.permissions.includes(p) ?? false;
                    return (
                      <td key={r} className="px-2.5 py-2 text-center">
                        {has ? <span className="text-ok" aria-label="Included">✓</span> : <span className="text-mute" aria-label="Not included">–</span>}
                      </td>
                    );
                  })}
                  <td className="px-2.5 py-2 text-xs text-mute">
                    {PLATFORM_ONLY.has(p) ? <Pill tone="amber">Platform only · cannot be granted to shop staff</Pill> : 'Partner staff'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
