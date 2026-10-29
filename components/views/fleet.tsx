'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { call, messageOf, qs, seg } from '../../lib/client/api';
import { useConsole, useResource } from '../../lib/client/console';
import { ago, count, dateTime, duration, money } from '../../lib/format';
import type { Kiosk, IssuedKey, Organization, Printer, SessionRow, Summary } from '../../lib/types';
import { DataTable, PageHeader, useToast } from '../ui/data';
import { ConfirmDialog, Modal, SecretDialog } from '../ui/dialogs';
import { Button, Field, Input, KV, LinkButton, Loading, Notice, Panel, Pill, Select, Stat, StatusDot } from '../ui/primitives';
import { Id, RawRecord, StatusPill, statusTone } from './common';

// ---------------------------------------------------------------------------
// QR points of one partner
// ---------------------------------------------------------------------------

export function QrPointsView({ orgId }: { orgId: string }) {
  const ctx = useConsole();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const org = ctx.organizations.find((o) => o.id === orgId);
  const mine = ctx.kiosks.filter((k) => k.organizationId === orgId).sort((a, b) => a.kioskId.localeCompare(b.kioskId));
  const elsewhere = ctx.kiosks.filter((k) => k.organizationId !== orgId);

  return (
    <>
      <PageHeader
        title="QR points"
        meta={<span>{count(mine.length)} at {org?.name ?? 'this partner'}. A QR point is a place customers scan, with a queue of jobs.</span>}
        actions={
          <>
            <Button onClick={() => setAssigning(true)} disabled={elsewhere.length === 0}>
              Move in an existing QR point
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              New QR point
            </Button>
          </>
        }
      />

      <Panel>
        <DataTable
          caption="QR points"
          rows={mine}
          rowKey={(k) => k.id}
          empty="No QR points yet. Create one, or move one in from another partner."
          rowHref={(k) => `/partners/${orgId}/qr-points/${k.id}`}
          columns={[
            { key: 'code', header: 'Code', mono: true, cell: (k) => k.kioskId },
            { key: 'name', header: 'Name', cell: (k) => k.name },
            { key: 'loc', header: 'Location', cell: (k) => k.location },
            { key: 'status', header: 'Status', cell: (k) => <StatusPill status={k.status} /> },
            { key: 'printers', header: 'Printers online', align: 'right', cell: (k) => `${k.printersOnline} / ${k.printersTotal}` },
            { key: 'id', header: 'ID', cell: (k) => <Id value={k.id} /> },
          ]}
        />
      </Panel>

      {creating && (
        <CreateQrPointDialog
          orgId={orgId}
          onClose={() => setCreating(false)}
          onDone={(code) => {
            toast(`QR point ${code} created`);
            ctx.reload();
          }}
        />
      )}

      {assigning && (
        <Modal open onClose={() => setAssigning(false)} title="Move an existing QR point here">
          <AssignKioskForm
            orgId={orgId}
            candidates={elsewhere}
            onDone={(code) => {
              toast(`${code} moved to ${org?.name ?? 'this partner'}`);
              ctx.reload();
              setAssigning(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}

function CreateQrPointDialog({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: (code: string) => void }) {
  const [kioskCode, setKioskCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [color, setColor] = useState(false);
  const [duplex, setDuplex] = useState(false);
  const [paperSizes, setPaperSizes] = useState('a4');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call('POST', 'kiosks', {
        kioskCode: kioskCode.trim().toUpperCase(),
        name: name.trim(),
        location: location.trim(),
        organizationId: orgId,
        capabilities: {
          color,
          duplex,
          paperSizes: paperSizes.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
        },
      });
      onDone(kioskCode.trim().toUpperCase());
      onClose();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New QR point">
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="2–10 letters, digits or hyphens. Printed on the QR code.">
            <Input value={kioskCode} onChange={(e) => setKioskCode(e.target.value)} required pattern="[A-Za-z0-9-]{2,10}" className="font-mono uppercase" />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} />
          </Field>
        </div>
        <Field label="Location">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={255} />
        </Field>
        <fieldset className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-3">
          <legend className="px-1 text-xs text-mute">Starting capabilities</legend>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={color} onChange={(e) => setColor(e.target.checked)} /> Colour
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={duplex} onChange={(e) => setDuplex(e.target.checked)} /> Double-sided
          </label>
          <Field label="Paper sizes">
            <Input value={paperSizes} onChange={(e) => setPaperSizes(e.target.value)} className="font-mono" />
          </Field>
        </fieldset>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create QR point'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignKioskForm({ orgId, candidates, onDone }: { orgId: string; candidates: Kiosk[]; onDone: (code: string) => void }) {
  const [kioskId, setKioskId] = useState(candidates[0]?.id ?? '');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = candidates.find((k) => k.id === kioskId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!chosen || confirmText !== chosen.kioskId) return;
    setBusy(true);
    setError(null);
    try {
      await call('POST', `organizations/${seg(orgId)}/kiosks`, { kioskId: chosen.id });
      onDone(chosen.kioskId);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Notice tone="warn">
        Moving a QR point hands it, with its printers and its job history, to the new partner. Revenue from then on is theirs.
      </Notice>
      <Field label="QR point">
        <Select value={kioskId} onChange={(e) => setKioskId(e.target.value)}>
          {candidates.map((k) => (
            <option key={k.id} value={k.id}>
              {k.kioskId} · {k.name} · now at {k.organizationName ?? 'nobody'}
            </option>
          ))}
        </Select>
      </Field>
      {chosen && (
        <Field label={`Type ${chosen.kioskId} to confirm`}>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" className="font-mono" />
        </Field>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" variant="danger" disabled={!chosen || confirmText !== chosen?.kioskId || busy}>
          {busy ? 'Moving…' : 'Move QR point'}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// One QR point
// ---------------------------------------------------------------------------

export function KioskDetailView({ orgId, kioskId }: { orgId: string; kioskId: string }) {
  const ctx = useConsole();
  const toast = useToast();
  const [enrolling, setEnrolling] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ title: string; label: string; value: string; note: string } | null>(null);

  const kiosk = ctx.kiosks.find((k) => k.id === kioskId);
  const org = ctx.organizations.find((o) => o.id === orgId);

  const summary = useResource<{ summary: Summary }>(`reports/summary${qs({ kioskId, period: 'month' })}`);
  const sessions = useResource<{ total: number; sessions: SessionRow[] }>(`reports/sessions${qs({ kioskId, limit: 20, period: 'year' })}`);

  if (!ctx.ready) return <Loading label="Loading QR point" />;
  if (!kiosk || kiosk.organizationId !== orgId) {
    return (
      <Notice tone="bad">
        That QR point is not at this partner. It may have moved, or never existed.{' '}
        <LinkButton href={`/partners/${orgId}/qr-points`} size="sm">
          Back to QR points
        </LinkButton>
      </Notice>
    );
  }

  const printers = ctx.printers.filter((p) => p.kiosk.id === kioskId).sort((a, b) => a.station.label.localeCompare(b.station.label));
  const others = ctx.organizations.filter((o) => o.id !== orgId);
  const s = summary.data?.summary;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setEnrolling(true)}>
          Enrol a printer here
        </Button>
        <Button onClick={() => setMoving(others[0]?.id ?? null)} disabled={others.length === 0}>
          Move to another partner
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Record" hint="Every field the platform holds for this QR point" className="xl:col-span-2">
          <KV
            items={[
              { label: 'Code', value: kiosk.kioskId, mono: true },
              { label: 'Name', value: kiosk.name },
              { label: 'Location', value: kiosk.location },
              { label: 'Status', value: <StatusPill status={kiosk.status} /> },
              { label: 'QR point ID', value: kiosk.id, mono: true },
              { label: 'Partner', value: org?.name ?? kiosk.organizationName ?? '—' },
              { label: 'Partner ID', value: kiosk.organizationId, mono: true },
              { label: 'Printers online', value: `${kiosk.printersOnline}` },
              { label: 'Printers in total (not revoked)', value: `${kiosk.printersTotal}` },
              {
                label: 'Capabilities',
                value: 'Set at creation. The API does not return them for a QR point, so they are shown on each printer instead.',
                wide: true,
              },
            ]}
          />
        </Panel>

        <Panel title="Edit" hint="Name, location and whether it takes work">
          <KioskEditForm
            kiosk={kiosk}
            onSaved={() => {
              toast('QR point saved');
              ctx.reload();
            }}
          />
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Printers at this QR point" hint="A paid job goes to whichever of these is idle and capable." actions={<Button size="sm" onClick={() => setEnrolling(true)}>Enrol</Button>}>
          <PrinterTable printers={printers} orgId={orgId} />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Revenue · this month" value={money(s?.revenue)} />
        <Stat label="Paid jobs · this month" value={count(s?.paidJobs)} />
        <Stat label="Printed · this month" value={count(s?.completedJobs)} sub={`${count(s?.failedJobs)} failed`} />
        <Stat label="Pages · this month" value={count(s?.pagesCharged)} sub={`${count(s?.pagesPrinted)} printed`} />
      </div>

      <div className="mt-4">
        <Panel title="Recent jobs" hint="The last 20 jobs at this QR point, over the last year">
          {sessions.error && <Notice tone="bad">{sessions.error}</Notice>}
          <SessionTable rows={sessions.data?.sessions ?? []} timeZone={org?.timezone} />
        </Panel>
      </div>

      <div className="mt-4">
        <RawRecord value={{ kiosk, printers, summary: s ?? null }} />
      </div>

      {enrolling && (
        <EnrollPrinterDialog
          kiosks={[kiosk]}
          lockedKioskId={kiosk.id}
          onClose={() => setEnrolling(false)}
          onIssued={(issued) => {
            setSecret({
              title: 'Printer enrolled',
              label: `API key for ${issued.printerId}`,
              value: issued.apiKey,
              note: 'Copy this key into the printer now. It is shown once, and the platform keeps only a fingerprint.',
            });
            ctx.reload();
          }}
        />
      )}

      {moving && (
        <Modal open onClose={() => setMoving(null)} title="Move this QR point to another partner">
          <MoveKioskForm
            kiosk={kiosk}
            targets={others}
            initial={moving}
            onDone={(name) => {
              toast(`${kiosk.kioskId} moved to ${name}`);
              ctx.reload();
              setMoving(null);
            }}
          />
        </Modal>
      )}

      <SecretDialog
        open={secret !== null}
        onClose={() => setSecret(null)}
        title={secret?.title ?? ''}
        label={secret?.label ?? ''}
        value={secret?.value ?? null}
        note={secret?.note ?? ''}
      />
    </>
  );
}

function KioskEditForm({ kiosk, onSaved }: { kiosk: Kiosk; onSaved: () => void }) {
  const [name, setName] = useState(kiosk.name);
  const [location, setLocation] = useState(kiosk.location);
  const [status, setStatus] = useState<string>(kiosk.status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const patch: Record<string, string> = {};
    if (name.trim() !== kiosk.name) patch.name = name.trim();
    if (location.trim() !== kiosk.location) patch.location = location.trim();
    if (status !== kiosk.status) patch.status = status;
    if (Object.keys(patch).length === 0) return;

    setBusy(true);
    setError(null);
    try {
      await call('PATCH', `kiosks/${seg(kiosk.id)}`, patch);
      onSaved();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} />
      </Field>
      <Field label="Location">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={255} />
      </Field>
      <Field label="Status" hint="Inactive or maintenance QR points refuse new sessions.">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="maintenance">Maintenance</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

function MoveKioskForm({
  kiosk,
  targets,
  initial,
  onDone,
}: {
  kiosk: Kiosk;
  targets: Organization[];
  initial: string;
  onDone: (partnerName: string) => void;
}) {
  const [target, setTarget] = useState(initial);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = targets.find((o) => o.id === target);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!chosen || typed !== kiosk.kioskId) return;
    setBusy(true);
    setError(null);
    try {
      await call('POST', `organizations/${seg(chosen.id)}/kiosks`, { kioskId: kiosk.id });
      onDone(chosen.name);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Notice tone="warn">Its printers and job history go with it. Revenue from now on belongs to the new partner.</Notice>
      <Field label="New partner">
        <Select value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={`Type ${kiosk.kioskId} to confirm`}>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="font-mono" />
      </Field>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" variant="danger" disabled={!chosen || typed !== kiosk.kioskId || busy}>
          {busy ? 'Moving…' : 'Move QR point'}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Printers (one partner, or all of them)
// ---------------------------------------------------------------------------

export function PrintersView({ orgId }: { orgId?: string }) {
  const ctx = useConsole();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [secret, setSecret] = useState<{ title: string; label: string; value: string; note: string } | null>(null);

  const scoped = orgId ? ctx.printers.filter((p) => p.organization?.id === orgId) : ctx.printers;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scoped
      .filter((p) => {
        if (!state) return true;
        if (state === 'revoked') return Boolean(p.enrollment.revokedAt) || p.status === 'revoked';
        if (state === 'silent') return p.silent;
        return p.status === state;
      })
      .filter((p) => !needle || `${p.station.label} ${p.printerId} ${p.kiosk.code} ${p.organization?.name ?? ''}`.toLowerCase().includes(needle))
      .sort((a, b) => (a.organization?.name ?? '').localeCompare(b.organization?.name ?? '') || a.station.label.localeCompare(b.station.label));
  }, [scoped, q, state]);

  const org = orgId ? ctx.organizations.find((o) => o.id === orgId) : null;

  return (
    <>
      <PageHeader
        crumbs={orgId && org ? [{ label: 'Partners', href: '/partners' }, { label: org.name, href: `/partners/${orgId}` }] : undefined}
        title="Printers"
        meta={<span>{count(scoped.length)} printers{org ? ` at ${org.name}` : ' across every partner'}</span>}
        actions={
          <Button variant="primary" onClick={() => setEnrolling(true)} disabled={ctx.kiosks.length === 0}>
            Enrol a printer
          </Button>
        }
      />

      <Panel>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_200px]">
          <Field label="Search">
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, printer ID, QR point code or partner" />
          </Field>
          <Field label="State">
            <Select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All</option>
              <option value="online">Online</option>
              <option value="busy">Busy</option>
              <option value="offline">Offline</option>
              <option value="silent">Silent (no heartbeat)</option>
              <option value="revoked">Revoked</option>
            </Select>
          </Field>
        </div>
        <PrinterTable printers={rows} orgId={orgId} showPartner={!orgId} />
      </Panel>

      {enrolling && (
        <EnrollPrinterDialog
          kiosks={ctx.kiosks}
          onClose={() => setEnrolling(false)}
          onIssued={(issued) => {
            setSecret({
              title: 'Printer enrolled',
              label: `API key for ${issued.printerId}`,
              value: issued.apiKey,
              note: 'Copy this key into the printer now. It is shown once, and the platform keeps only a fingerprint.',
            });
            ctx.reload();
            toast('Printer enrolled');
          }}
        />
      )}

      <SecretDialog
        open={secret !== null}
        onClose={() => setSecret(null)}
        title={secret?.title ?? ''}
        label={secret?.label ?? ''}
        value={secret?.value ?? null}
        note={secret?.note ?? ''}
      />
    </>
  );
}

export function PrinterTable({
  printers,
  orgId,
  showPartner = false,
}: {
  printers: Printer[];
  orgId?: string;
  showPartner?: boolean;
}) {
  const href = (p: Printer) => `/partners/${p.organization?.id ?? orgId ?? ''}/printers/${encodeURIComponent(p.printerId)}`;
  return (
    <DataTable
      caption="Printers"
      rows={printers}
      rowKey={(p) => p.printerId}
      empty="No printers here yet"
      rowHref={(p) => (p.organization || orgId ? href(p) : '/printers')}
      columns={[
        {
          key: 'label',
          header: 'Printer',
          cell: (p) => (
            <span className="flex items-center gap-2">
              <StatusDot tone={statusTone(p.enrollment.revokedAt ? 'revoked' : p.status)} />
              {p.station.label}
            </span>
          ),
        },
        ...(showPartner ? [{ key: 'org', header: 'Partner', cell: (p: Printer) => p.organization?.name ?? '—' }] : []),
        { key: 'qr', header: 'QR point', mono: true, cell: (p: Printer) => p.kiosk.code },
        {
          key: 'status',
          header: 'Status',
          cell: (p: Printer) => (p.enrollment.revokedAt ? <Pill tone="bad">revoked</Pill> : <StatusPill status={p.status} />),
        },
        { key: 'hb', header: 'Last heartbeat', cell: (p: Printer) => (p.secondsSinceHeartbeat === null ? 'Never' : ago(p.secondsSinceHeartbeat)) },
        { key: 'jobs', header: 'Active jobs', align: 'right', cell: (p: Printer) => count(p.activeJobs) },
        { key: 'paper', header: 'Paper', align: 'right', cell: (p: Printer) => (p.paperLevel === null ? '—' : `${p.paperLevel}%`) },
        { key: 'ink', header: 'Black ink', align: 'right', cell: (p: Printer) => (p.inkLevelBlack === null ? '—' : `${p.inkLevelBlack}%`) },
        { key: 'key', header: 'Key', mono: true, cell: (p: Printer) => p.enrollment.keyPrefix ?? '—' },
        { key: 'id', header: 'Printer ID', mono: true, cell: (p: Printer) => p.printerId },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Enrolling a printer (mints a key, shown once)
// ---------------------------------------------------------------------------

function EnrollPrinterDialog({
  kiosks,
  lockedKioskId,
  onClose,
  onIssued,
}: {
  kiosks: Kiosk[];
  lockedKioskId?: string;
  onClose: () => void;
  onIssued: (issued: IssuedKey) => void;
}) {
  const [printerId, setPrinterId] = useState('');
  const [kioskId, setKioskId] = useState(lockedKioskId ?? kiosks[0]?.id ?? '');
  const [name, setName] = useState('');
  const [color, setColor] = useState(false);
  const [duplex, setDuplex] = useState(false);
  const [maxCopies, setMaxCopies] = useState('10');
  const [paperSizes, setPaperSizes] = useState('a4');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const issued = await call<IssuedKey>('POST', 'printers/enroll', {
        printerId: printerId.trim(),
        kioskId,
        name: name.trim(),
        capabilities: {
          supportsColor: color,
          supportsDoubleSided: duplex,
          maxCopies: Number(maxCopies) || 1,
          supportedPaperSizes: paperSizes.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
        },
      });
      onIssued(issued);
      onClose();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Enrol a printer" wide>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Printer ID" hint="3–64 letters, digits, underscores or hyphens, e.g. RPI_M002_01">
            <Input value={printerId} onChange={(e) => setPrinterId(e.target.value)} required pattern="[A-Za-z0-9_-]{3,64}" className="font-mono" />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} />
          </Field>
          <Field label="QR point">
            <Select value={kioskId} onChange={(e) => setKioskId(e.target.value)} disabled={Boolean(lockedKioskId)}>
              {kiosks.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.kioskId} · {k.name} · {k.organizationName ?? 'no partner'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Max copies">
            <Input type="number" min={1} max={100} value={maxCopies} onChange={(e) => setMaxCopies(e.target.value)} />
          </Field>
          <Field label="Paper sizes">
            <Input value={paperSizes} onChange={(e) => setPaperSizes(e.target.value)} className="font-mono" />
          </Field>
          <div className="flex flex-col gap-2 pt-6 text-sm text-ink">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={color} onChange={(e) => setColor(e.target.checked)} /> Supports colour
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={duplex} onChange={(e) => setDuplex(e.target.checked)} /> Double-sided
            </label>
          </div>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !kioskId}>
            {busy ? 'Enrolling…' : 'Enrol and show key'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// One printer: its own page
// ---------------------------------------------------------------------------

const PERIOD_LABEL: Record<string, string> = { day: 'today', week: 'this week', month: 'this month', year: 'this year' };

export function PrinterDetailView({ orgId, printerId }: { orgId: string; printerId: string }) {
  const ctx = useConsole();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [secret, setSecret] = useState<{ title: string; label: string; value: string; note: string } | null>(null);

  const printer = ctx.printers.find((p) => p.printerId === printerId);
  const org = ctx.organizations.find((o) => o.id === orgId);

  const [period, setPeriod] = useState('month');
  const summary = useResource<{ summary: Summary }>(`reports/summary${qs({ printerId, period })}`);
  const partnerSummary = useResource<{ summary: Summary }>(`reports/summary${qs({ organizationId: orgId, period })}`);
  const sessions = useResource<{ total: number; sessions: SessionRow[] }>(`reports/sessions${qs({ printerId, limit: 20, period })}`);

  if (!ctx.ready) return <Loading label="Loading printer" />;
  if (!printer || printer.organization?.id !== orgId) {
    return (
      <Notice tone="bad">
        No printer with the ID <span className="font-mono">{printerId}</span> is at this partner.{' '}
        <LinkButton href={`/partners/${orgId}/printers`} size="sm">
          Back to printers
        </LinkButton>
      </Notice>
    );
  }

  const revoked = Boolean(printer.enrollment.revokedAt) || printer.status === 'revoked';
  const s = summary.data?.summary;
  const partner = partnerSummary.data?.summary;
  const periodLabel = PERIOD_LABEL[period] ?? 'this period';
  const sharePct = partner && partner.revenue > 0 && s ? Math.round((s.revenue / partner.revenue) * 1000) / 10 : null;

  const refresh = () => {
    ctx.reload();
    summary.reload();
    sessions.reload();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setEditing(true)} disabled={revoked}>
          Edit
        </Button>
        <Button onClick={() => setRotating(true)} disabled={revoked}>
          Rotate key
        </Button>
        <Button variant="danger" onClick={() => setRevoking(true)} disabled={revoked}>
          Revoke
        </Button>
      </div>

      {revoked && (
        <div className="mb-4">
          <Notice tone="bad">
            This printer is revoked. It cannot authenticate, and the platform has no control to restore it. Enrol it again under a new ID to put it back
            in service.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Record" hint="Every field the platform holds for this printer" className="xl:col-span-2">
          <KV
            items={[
              { label: 'Label on screen', value: printer.station.label },
              { label: 'Name', value: printer.name },
              { label: 'Printer ID', value: printer.printerId, mono: true },
              { label: 'State', value: revoked ? <Pill tone="bad">revoked</Pill> : <StatusPill status={printer.status} /> },
              { label: 'Silent (heartbeat overdue)', value: printer.silent ? 'Yes' : 'No' },
              { label: 'QR point', value: `${printer.kiosk.code} · ${printer.kiosk.name ?? ''}` },
              { label: 'QR point ID', value: printer.kiosk.id, mono: true },
              { label: 'Partner', value: org?.name ?? printer.organization?.name ?? '—' },
              { label: 'Partner ID', value: printer.organization?.id ?? null, mono: true },
              { label: 'Colour', value: printer.capabilities.color ? 'Yes' : 'No' },
              { label: 'Double-sided', value: printer.capabilities.doubleSided ? 'Yes' : 'No' },
              { label: 'Key prefix', value: printer.enrollment.keyPrefix, mono: true },
              { label: 'Key issued', value: dateTime(printer.enrollment.keyIssuedAt, org?.timezone) },
              { label: 'Enrolled', value: printer.enrollment.enrolled ? 'Yes' : 'No' },
              { label: 'Revoked at', value: dateTime(printer.enrollment.revokedAt, org?.timezone) },
              { label: 'Last seen from (IP)', value: printer.enrollment.lastSeenIp, mono: true },
              { label: 'Last heartbeat', value: dateTime(printer.lastHeartbeat, org?.timezone) },
              { label: 'Seconds since heartbeat', value: printer.secondsSinceHeartbeat === null ? null : `${printer.secondsSinceHeartbeat}` },
              { label: 'Active jobs', value: `${printer.activeJobs}` },
              { label: 'Paper level', value: printer.paperLevel === null ? null : `${printer.paperLevel}%` },
              { label: 'Black ink level', value: printer.inkLevelBlack === null ? null : `${printer.inkLevelBlack}%` },
            ]}
          />
        </Panel>

        <Panel
          title={`Work ${periodLabel}`}
          hint="Work done by this printer. Partner revenue includes any paid job that never reached a printer."
          actions={
            <select
              aria-label="Period"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 rounded-full border border-line bg-bg px-4 text-sm text-ink focus:border-brand-text focus:outline-none"
            >
              <option value="day">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
            </select>
          }
        >
          <div className="mb-4 rounded-2xl bg-raised px-4 py-3 text-sm leading-relaxed text-ink">
            {!s || s.paidJobs === 0 ? (
              <>This printer took no paid jobs {periodLabel}.</>
            ) : (
              <>
                Earned <span className="font-semibold">{money(s.revenue)}</span>
                {partner && (
                  <>
                    {' '}of <span className="font-semibold">{money(partner.revenue)}</span> at {org?.name ?? 'this partner'}
                    {sharePct !== null && <> ({sharePct}%)</>}
                  </>
                )}
                .
              </>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <Stat label="Revenue" value={money(s?.revenue)} />
            <Stat label="Paid jobs" value={count(s?.paidJobs)} />
            <Stat label="Printed" value={count(s?.completedJobs)} sub={`${count(s?.failedJobs)} failed`} />
            <Stat label="Pages" value={count(s?.pagesPrinted)} sub={`${count(s?.pagesCharged)} charged`} />
            <Stat label="Avg print time" value={duration(s?.avgPrintSeconds)} />
            <Stat label="Fulfilment" value={s?.fulfilmentRate === null || s?.fulfilmentRate === undefined ? '—' : `${s.fulfilmentRate}%`} />
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Recent jobs" hint={`The last 20 jobs this printer took ${periodLabel}`}>
          {sessions.error && <Notice tone="bad">{sessions.error}</Notice>}
          <SessionTable rows={sessions.data?.sessions ?? []} timeZone={org?.timezone} />
        </Panel>
      </div>

      <div className="mt-4">
        <RawRecord value={{ printer, summary: s ?? null }} />
      </div>

      {editing && (
        <EditPrinterDialog
          printer={printer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            toast('Printer saved');
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={rotating}
        onClose={() => setRotating(false)}
        title="Rotate this printer's key?"
        danger
        requireText={printer.printerId}
        confirmLabel="Rotate key"
        body={
          <>
            The current key stops working the moment this runs. The printer goes offline until it is given the new key. The new key is shown once, next.
          </>
        }
        onConfirm={async () => {
          const issued = await call<IssuedKey>('POST', `printers/${seg(printer.printerId)}/rotate-key`);
          setSecret({
            title: 'New printer key',
            label: `API key for ${issued.printerId}`,
            value: issued.apiKey,
            note: 'Give this to the printer now. It is shown once, and the old key no longer works.',
          });
          refresh();
        }}
      />

      <ConfirmDialog
        open={revoking}
        onClose={() => setRevoking(false)}
        title="Revoke this printer?"
        danger
        requireText={printer.printerId}
        confirmLabel="Revoke printer"
        body={
          <>
            A revoked printer cannot authenticate, and jobs stop routing to it. The platform has no control to undo a revocation. Use this when a device is
            lost, stolen or misused.
          </>
        }
        onConfirm={async () => {
          await call('POST', `printers/${seg(printer.printerId)}/revoke`);
          toast('Printer revoked');
          refresh();
        }}
      />

      <SecretDialog
        open={secret !== null}
        onClose={() => setSecret(null)}
        title={secret?.title ?? ''}
        label={secret?.label ?? ''}
        value={secret?.value ?? null}
        note={secret?.note ?? ''}
      />
    </>
  );
}

function EditPrinterDialog({ printer, onClose, onSaved }: { printer: Printer; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(printer.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    if (name.trim() !== printer.name) patch.name = name.trim();
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await call('PATCH', `printers/${seg(printer.printerId)}`, patch);
      onSaved();
      onClose();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${printer.printerId}`}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={255} />
        </Field>
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
// Session rows, shared by the QR point and printer pages
// ---------------------------------------------------------------------------

export function SessionTable({ rows, timeZone }: { rows: SessionRow[]; timeZone?: string }) {
  return (
    <DataTable
      caption="Jobs"
      rows={rows}
      rowKey={(r) => r.jobId}
      empty="No jobs in this period"
      columns={[
        { key: 'when', header: 'When', cell: (r) => dateTime(r.createdAt, timeZone) },
        { key: 'job', header: 'Job', cell: (r) => <Id value={r.jobId} /> },
        { key: 'status', header: 'Status', cell: (r) => <StatusPill status={r.status} /> },
        { key: 'pay', header: 'Payment', cell: (r) => <StatusPill status={r.paymentStatus} /> },
        { key: 'settings', header: 'Settings', cell: (r) => `${r.settings.colorMode} · ${r.settings.printSides} · ×${r.settings.copies}` },
        { key: 'pages', header: 'Pages', align: 'right', cell: (r) => `${count(r.pages.printed)} / ${count(r.pages.charged)}` },
        { key: 'amount', header: 'Amount', align: 'right', cell: (r) => money(r.amount) },
        { key: 'dur', header: 'Print time', align: 'right', cell: (r) => duration(r.durationSeconds) },
        { key: 'printer', header: 'Printer', cell: (r) => r.printer?.name ?? '—' },
      ]}
    />
  );
}
