'use client';

import type { ReactNode } from 'react';
import type { AdminRole, Organization, OrgStatus } from '../../lib/types';
import type { Tone } from '../../lib/tree.ts';
import { modelById } from '../../lib/models';
import { Pill } from '../ui/primitives';

/** Shared labels and tones, so one status reads the same on every page. */

export const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Platform account',
  owner: 'Owner',
  manager: 'Manager',
  viewer: 'Viewer',
};

export function roleTone(role: AdminRole): Tone {
  if (role === 'super_admin') return 'amber';
  if (role === 'owner') return 'amber';
  if (role === 'manager') return 'ok';
  return 'muted';
}

export function orgTone(status: OrgStatus | string): Tone {
  return status === 'suspended' ? 'bad' : 'ok';
}

export function orgLabel(status: OrgStatus | string): string {
  return status === 'suspended' ? 'Suspended' : 'Active';
}

/** A printer, QR point, job or queue state, as a tone. */
export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case 'online':
    case 'active':
    case 'completed':
    case 'paid':
      return 'ok';
    case 'busy':
    case 'printing':
      return 'amber';
    case 'offline':
    case 'inactive':
    case 'maintenance':
    case 'queued':
    case 'assigned':
    case 'pending':
      return 'warn';
    case 'revoked':
    case 'failed':
    case 'suspended':
      return 'bad';
    default:
      return 'muted';
  }
}

export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return status.replace(/_/g, ' ');
}

export function modelName(id: string | null | undefined): string {
  return modelById(id)?.label ?? 'Not set';
}

export function ModelPill({ id }: { id: string | null | undefined }) {
  const model = modelById(id);
  if (!model) return <Pill tone="warn">Not set</Pill>;
  return <Pill tone="amber">{model.short}</Pill>;
}

export function StatusPill({ status }: { status: string | null | undefined }) {
  return (
    <Pill tone={statusTone(status)} dot>
      {statusLabel(status)}
    </Pill>
  );
}

export function OrgPill({ org }: { org: Pick<Organization, 'status'> }) {
  return (
    <Pill tone={orgTone(org.status)} dot>
      {orgLabel(org.status)}
    </Pill>
  );
}

/** The first eight characters of a UUID, for a dense table. The full value is on the detail page. */
export function short(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export function Id({ value }: { value: string | null | undefined }): ReactNode {
  if (!value) return '—';
  return (
    <span className="font-mono text-[12px] text-mute" title={value}>
      {short(value)}
    </span>
  );
}

export function Yes({ value }: { value: boolean | null | undefined }) {
  return value ? <Pill tone="ok">Yes</Pill> : <Pill tone="muted">No</Pill>;
}

export function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
}

/**
 * The complete record as the API returned it. Every detail page carries one, so
 * no field the platform holds is out of reach of the operator, even one the
 * designed view does not show.
 */
export function RawRecord({ value, label = 'Raw record' }: { value: unknown; label?: string }) {
  return (
    <details className="rounded-md border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-2.5 text-sm text-mute hover:text-ink">{label} (JSON)</summary>
      <pre className="max-h-[480px] overflow-auto border-t border-line px-4 py-3 font-mono text-[12px] leading-relaxed text-ink">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
