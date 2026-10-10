'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { call, messageOf, qs, seg } from '../../lib/client/api';
import { useConsole, useResource } from '../../lib/client/console';
import { actionLabel, dateTime, shortDate } from '../../lib/format';
import type { AdminRole, AuditEntry, CreatedStaff, Organization, PermissionCatalogue, StaffPermissions, StaffUser } from '../../lib/types';
import { DataTable, PageHeader, useToast } from '../ui/data';
import { ConfirmDialog, Modal, SecretDialog } from '../ui/dialogs';
import { Button, Field, Input, KV, LinkButton, Loading, Notice, Panel, Pill, Select, cx } from '../ui/primitives';
import { Id, RawRecord, ROLE_LABEL, roleTone } from './common';

const ROLE_ORDER: Record<string, number> = { owner: 0, manager: 1, viewer: 2, super_admin: 3 };
const SHOP_ROLES: AdminRole[] = ['owner', 'manager', 'viewer'];

/** Staff of one partner (grouped by role), or every account on the platform. */
export function StaffListView({ orgId }: { orgId?: string }) {
  const ctx = useConsole();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');

  const org = orgId ? ctx.organizations.find((o) => o.id === orgId) : null;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ctx.users
      .filter((u) => !u.deletedAt)
      .filter((u) => (orgId ? u.organizationId === orgId : true))
      .filter((u) => !needle || `${u.email} ${u.fullName ?? ''} ${u.role}`.toLowerCase().includes(needle))
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.email.localeCompare(b.email));
  }, [ctx.users, orgId, q]);

  const removed = ctx.users.filter((u) => u.deletedAt && (orgId ? u.organizationId === orgId : true));

  return (
    <>
      <PageHeader
        crumbs={org ? [{ label: 'Partners', href: '/partners' }, { label: org.name, href: `/partners/${org.id}` }] : undefined}
        title={orgId ? 'Staff' : 'Staff and platform accounts'}
        meta={
          <span>
            {rows.length} active or inactive{orgId ? '' : ' across every partner, plus platform accounts'}
            {removed.length > 0 ? ` · ${removed.length} removed` : ''}
          </span>
        }
        actions={
          orgId ? (
            <Button variant="primary" onClick={() => setCreating(true)} disabled={!org}>
              Add staff
            </Button>
          ) : null
        }
      />

      <Panel>
        <div className="mb-4">
          <Field label="Search">
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email, name or role" className="md:max-w-md" />
          </Field>
        </div>
        <DataTable
          caption="Staff"
          rows={rows}
          rowKey={(u) => u.id}
          empty="No staff yet. Add the first owner."
          rowHref={(u) => (u.organizationId && u.role !== 'super_admin' ? `/partners/${u.organizationId}/staff/${u.id}` : undefined)}
          columns={[
            { key: 'name', header: 'Name', cell: (u) => u.fullName || <span className="text-mute">No name</span> },
            { key: 'email', header: 'Email', mono: true, cell: (u) => u.email },
            { key: 'role', header: 'Role', cell: (u) => <Pill tone={roleTone(u.role)}>{ROLE_LABEL[u.role] ?? u.role}</Pill> },
            {
              key: 'active',
              header: 'Account',
              cell: (u) => (u.isActive ? <Pill tone="ok" dot>active</Pill> : <Pill tone="muted" dot>inactive</Pill>),
            },
            { key: 'temp', header: 'Temp password', cell: (u) => (u.mustChangePassword ? <Pill tone="warn">must change</Pill> : '—') },
            { key: 'last', header: 'Last sign-in', cell: (u) => (u.lastLoginAt ? dateTime(u.lastLoginAt, org?.timezone) : 'Never') },
            ...(orgId ? [] : [{ key: 'org', header: 'Partner', cell: (u: StaffUser) => u.organizationName ?? (u.role === 'super_admin' ? 'Platform' : '—') }]),
            { key: 'id', header: 'ID', cell: (u: StaffUser) => <Id value={u.id} /> },
          ]}
        />
        {!orgId && (
          <p className="mt-4 text-xs text-mute">
            Platform accounts are created and changed from the command line, not here. This list shows them so the full picture is in one place.
          </p>
        )}
      </Panel>

      {creating && org && (
        <CreateStaffDialog
          org={org}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            toast(`Added ${created.user.email}`);
            ctx.reload();
          }}
        />
      )}
    </>
  );
}

function CreateStaffDialog({
  org,
  onClose,
  onCreated,
}: {
  org: Organization;
  onClose: () => void;
  onCreated: (created: CreatedStaff) => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AdminRole>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<CreatedStaff | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await call<CreatedStaff>('POST', 'users', {
        email: email.trim(),
        fullName: fullName.trim() || null,
        role,
        organizationId: org.id,
      });
      onCreated(created);
      setSecret(created);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open={!secret} onClose={onClose} title={`Add staff to ${org.name}`}>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} autoComplete="off" />
          </Field>
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={255} autoComplete="off" />
          </Field>
          <Field label="Role" hint="Owners see everything at the partner. Viewers see reports. Permissions can be adjusted per person afterwards.">
            <Select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
              {SHOP_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add and show password'}
            </Button>
          </div>
        </form>
      </Modal>

      <SecretDialog
        open={secret !== null}
        onClose={onClose}
        title="Temporary password"
        label={`Temporary password for ${secret?.user.email ?? ''}`}
        value={secret?.temporaryPassword ?? null}
        note="Share this with them through a channel you trust. They must change it at first sign-in. It is shown once."
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// One person
// ---------------------------------------------------------------------------

type Effect = 'inherit' | 'grant' | 'deny';

const PLATFORM_ONLY = new Set(['orgs:read', 'orgs:write', 'pricing:write', 'platform:reports', 'audit:read_all']);

export function StaffDetailView({ orgId, userId }: { orgId: string; userId: string }) {
  const ctx = useConsole();
  const toast = useToast();
  const org = ctx.organizations.find((o) => o.id === orgId);

  const user = useResource<StaffUser>(`users/${seg(userId)}`);
  const perms = useResource<StaffPermissions>(`users/${seg(userId)}/permissions`);
  const catalogue = useResource<PermissionCatalogue>('permissions');
  const audit = useResource<{ total: number; entries: AuditEntry[] }>(`audit${qs({ organizationId: orgId, limit: 200 })}`);

  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Effect> | null>(null);
  const [applying, setApplying] = useState(false);

  if (!user.data) return user.error ? <Notice tone="bad">{user.error}</Notice> : <Loading label="Loading person" />;
  const u = user.data;

  if (u.organizationId !== orgId) {
    return (
      <Notice tone="bad">
        That account is not at this partner.{' '}
        <LinkButton href={`/partners/${orgId}/staff`} size="sm">
          Back to staff
        </LinkButton>
      </Notice>
    );
  }

  const refresh = () => {
    user.reload();
    perms.reload();
    ctx.reload();
  };

  const overrides = new Map((perms.data?.overrides ?? []).map((o) => [o.permission, o.effect as Effect]));
  const effectiveFor = (permission: string, effect: Effect) => {
    if (effect === 'grant') return true;
    if (effect === 'deny') return false;
    return perms.data?.effective.includes(permission) ?? false;
  };

  const roleDefaults = new Set(catalogue.data?.roles.find((r) => r.role === u.role)?.permissions ?? []);
  const currentDraft: Record<string, Effect> = draft ?? Object.fromEntries((catalogue.data?.permissions ?? []).map((p) => [p, overrides.get(p) ?? 'inherit']));
  const changes = (catalogue.data?.permissions ?? []).filter((p) => (currentDraft[p] ?? 'inherit') !== (overrides.get(p) ?? 'inherit'));

  const personAudit = (audit.data?.entries ?? []).filter((e) => e.actor?.email === u.email);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setEditing(true)}>Edit details</Button>
        <Button onClick={() => setResetting(true)}>Reset password</Button>
        <Button onClick={() => setUnlocking(true)}>Unlock account</Button>
        <Button variant="danger" onClick={() => setRemoving(true)}>
          Remove
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Record" hint="Every field the platform holds for this account" className="xl:col-span-2">
          <KV
            items={[
              { label: 'Full name', value: u.fullName },
              { label: 'Email', value: u.email, mono: true },
              { label: 'Role', value: <Pill tone={roleTone(u.role)}>{ROLE_LABEL[u.role] ?? u.role}</Pill> },
              { label: 'Account', value: u.isActive ? 'Active' : 'Inactive' },
              { label: 'Must change password', value: u.mustChangePassword ? 'Yes' : 'No' },
              { label: 'Partner', value: org?.name ?? u.organizationName ?? '—' },
              { label: 'Partner ID', value: u.organizationId, mono: true },
              { label: 'Account ID', value: u.id, mono: true },
              { label: 'Created', value: dateTime(u.createdAt, org?.timezone) },
              { label: 'Last sign-in', value: u.lastLoginAt ? dateTime(u.lastLoginAt, org?.timezone) : 'Never' },
              { label: 'Removed', value: u.deletedAt ? dateTime(u.deletedAt, org?.timezone) : 'No' },
              { label: 'Last sign-in IP', value: 'Not returned by the API', wide: true },
            ]}
          />
        </Panel>
        <Panel title="Activity" hint="Partner audit entries signed by this person, from the latest 200">
          {audit.error && <Notice tone="bad">{audit.error}</Notice>}
          {personAudit.length === 0 ? (
            <p className="text-sm text-mute">No recent entries by this person.</p>
          ) : (
            <ul className="space-y-2">
              {personAudit.slice(0, 12).map((e) => (
                <li key={e.id} className="flex justify-between gap-3 border-b border-line/60 pb-2 text-sm">
                  <span className="text-ink">{actionLabel(e.action)}</span>
                  <span className="shrink-0 text-xs text-mute">{shortDate(e.createdAt, org?.timezone)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel
          title="Permissions"
          hint="The role gives a default set. An override can grant or deny one permission for this person only. Denial always wins."
          actions={
            changes.length > 0 ? (
              <>
                <Button size="sm" onClick={() => setDraft(null)}>
                  Discard
                </Button>
                <Button size="sm" variant="primary" onClick={() => setApplying(true)}>
                  Review {changes.length} change{changes.length === 1 ? '' : 's'}
                </Button>
              </>
            ) : null
          }
        >
          {catalogue.error && <Notice tone="bad">{catalogue.error}</Notice>}
          {perms.error && <Notice tone="bad">{perms.error}</Notice>}
          <DataTable
            caption="Permissions for this account"
            rows={catalogue.data?.permissions ?? []}
            rowKey={(p) => p}
            empty={catalogue.loading ? 'Loading…' : 'No permissions loaded'}
            columns={[
              {
                key: 'perm',
                header: 'Permission',
                mono: true,
                cell: (p: string) => (
                  <span className="block">
                    {p}
                    {PLATFORM_ONLY.has(p) && (
                      <span className="mt-1 block">
                        <Pill tone="amber">platform only</Pill>
                      </span>
                    )}
                  </span>
                ),
              },
              { key: 'role', header: 'Role default', cell: (p: string) => (roleDefaults.has(p) ? 'Yes' : 'No') },
              {
                key: 'override',
                header: 'Override',
                cell: (p: string) => {
                  const effect = currentDraft[p] ?? 'inherit';
                  const platformOnly = PLATFORM_ONLY.has(p);
                  return (
                    <Select
                      aria-label={`Override for ${p}`}
                      value={effect}
                      className="w-full md:w-auto md:min-w-[190px] py-2.5"
                      onChange={(e) => setDraft({ ...currentDraft, [p]: e.target.value as Effect })}
                    >
                      <option value="inherit">Role default</option>
                      <option value="grant" disabled={platformOnly}>
                        Grant{platformOnly ? ' (not for shop staff)' : ''}
                      </option>
                      <option value="deny">Deny</option>
                    </Select>
                  );
                },
              },
              {
                key: 'eff',
                header: 'Effective',
                cell: (p: string) => {
                  const effect = currentDraft[p] ?? 'inherit';
                  return effectiveFor(p, effect) ? <Pill tone="ok">allowed</Pill> : <Pill tone="muted">not allowed</Pill>;
                },
              },
            ]}
          />
          <p className="mt-3 text-xs text-mute">
            Any change ends this person&apos;s current sessions, so they must sign in again to pick it up.
          </p>
        </Panel>
      </div>

      <div className="mt-4">
        <RawRecord value={{ user: u, permissions: perms.data ?? null, catalogue: catalogue.data ?? null }} />
      </div>

      {editing && (
        <EditStaffDialog
          user={u}
          onClose={() => setEditing(false)}
          onSaved={() => {
            toast('Saved');
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="Reset this password?"
        danger
        requireText={u.email}
        confirmLabel="Reset password"
        body={<>A new temporary password is issued and every current session ends. They must change it at next sign-in. The new password is shown once, next.</>}
        onConfirm={async () => {
          const res = await call<{ temporaryPassword: string }>('POST', `users/${seg(u.id)}/reset-password`);
          setSecret(res.temporaryPassword);
          refresh();
        }}
      />

      <ConfirmDialog
        open={unlocking}
        onClose={() => setUnlocking(false)}
        title="Unlock this account?"
        confirmLabel="Unlock"
        body={<>Clears the failed-sign-in count and lifts a lock caused by repeated wrong passwords.</>}
        onConfirm={async () => {
          await call('POST', `users/${seg(u.id)}/unlock`);
          toast('Account unlocked');
          refresh();
        }}
      />

      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title="Remove this account?"
        danger
        requireText={u.email}
        confirmLabel="Remove account"
        body={<>The account is deactivated and its sessions end. The record and its audit history stay. The email address can be used again afterwards.</>}
        onConfirm={async () => {
          await call('DELETE', `users/${seg(u.id)}`);
          toast('Account removed');
          refresh();
        }}
      />

      <ConfirmDialog
        open={applying}
        onClose={() => setApplying(false)}
        title={`Apply ${changes.length} permission change${changes.length === 1 ? '' : 's'}?`}
        danger
        requireText={u.email}
        confirmLabel="Apply changes"
        body={
          <ul className="space-y-1 font-mono text-[12px]">
            {changes.map((p) => (
              <li key={p}>
                {p}: {overrides.get(p) ?? 'inherit'} → {currentDraft[p]}
              </li>
            ))}
          </ul>
        }
        onConfirm={async () => {
          for (const p of changes) {
            await call('PUT', `users/${seg(u.id)}/permissions`, { permission: p, effect: currentDraft[p] });
          }
          toast('Permissions updated');
          setDraft(null);
          refresh();
        }}
      />

      <SecretDialog
        open={secret !== null}
        onClose={() => setSecret(null)}
        title="New temporary password"
        label={`Temporary password for ${u.email}`}
        value={secret}
        note="Share this with them through a channel you trust. They must change it at first sign-in. It is shown once."
      />
    </>
  );
}

function EditStaffDialog({ user, onClose, onSaved }: { user: StaffUser; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(user.fullName ?? '');
  const [role, setRole] = useState<AdminRole>(user.role);
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if ((fullName.trim() || null) !== (user.fullName || null)) patch.fullName = fullName.trim() || null;
    if (role !== user.role) patch.role = role;
    if (isActive !== user.isActive) patch.isActive = isActive;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await call('PATCH', `users/${seg(user.id)}`, patch);
      onSaved();
      onClose();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${user.email}`}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={255} />
        </Field>
        <Field label="Role" hint="A role change ends the person's sessions.">
          <Select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
            {SHOP_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Account is active
        </label>
        {!isActive && <Notice tone="warn">Deactivating ends the person&apos;s sessions at once. They cannot sign in until reactivated.</Notice>}
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
