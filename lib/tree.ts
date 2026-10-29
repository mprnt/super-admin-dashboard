/**
 * The navigator and the search index, built from the four lists the console loads
 * once: partners, QR points, printers and staff. Pure, so the ordering and the
 * matching are tested.
 *
 * The navigator is deliberately shallow. A partner is one row, and its sections
 * (overview, staff, QR points, printers, money…) live in the partner's own tabs,
 * not in the navigator, so nothing is listed twice.
 *
 *   Platform
 *     Overview · Business models · Partner comparison · Print queue · Leads
 *   Partners
 *     <Partner>                 one row each
 *   Across every partner
 *     Printers · Staff · Sessions · Pricing · Attention · Audit · Permissions · Account
 *
 * The search index (⌘K) is flat and includes everything, so a printer, a person
 * or a QR point can still be found from anywhere.
 */

import type { Kiosk, Organization, Printer, StaffUser } from './types.ts';
import { BUSINESS_MODELS } from './models.ts';

export type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'amber';

export interface TreeNode {
  id: string;
  label: string;
  href: string;
  /** Small text after the label: a count, an id, a model. */
  meta?: string;
  tone?: Tone;
  /** What kind of thing this is, for the search results ("Partner", "Printer"…). */
  kind?: string;
  children?: TreeNode[];
}

export interface TreeSection {
  id: string;
  title: string;
  nodes: TreeNode[];
}

export interface TreeInput {
  organizations: Organization[];
  kiosks: Kiosk[];
  printers: Printer[];
  users: StaffUser[];
}

const ROLE_ORDER: Record<string, number> = { owner: 0, manager: 1, viewer: 2, super_admin: 3 };

export function partnerTone(o: Organization): Tone {
  return o.status === 'suspended' ? 'bad' : 'ok';
}

export function printerTone(p: Printer): Tone {
  if (p.status === 'revoked' || p.enrollment.revokedAt) return 'bad';
  if (p.status === 'offline' || p.silent) return 'warn';
  return 'ok';
}

export function kioskTone(k: Kiosk): Tone {
  if (k.status === 'active') return 'ok';
  return 'warn';
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** The pages that are not about one partner. */
const PLATFORM_PAGES: TreeNode[] = [
  { id: 'overview', label: 'Overview', href: '/', kind: 'Page' },
  { id: 'billing', label: 'Billing', href: '/billing', kind: 'Page' },
  { id: 'reports', label: 'Partner comparison', href: '/reports', kind: 'Page' },
  { id: 'queue', label: 'Print queue', href: '/queue', kind: 'Page' },
  { id: 'leads', label: 'Leads', href: '/leads', kind: 'Page' },
];

const OPERATION_PAGES: TreeNode[] = [
  { id: 'all-printers', label: 'Printers', href: '/printers', kind: 'Page' },
  { id: 'all-staff', label: 'Staff and platform accounts', href: '/staff', kind: 'Page' },
  { id: 'all-sessions', label: 'Sessions', href: '/sessions', kind: 'Page' },
  { id: 'all-pricing', label: 'Pricing', href: '/pricing', kind: 'Page' },
  { id: 'all-attention', label: 'Attention', href: '/attention', kind: 'Page' },
  { id: 'all-audit', label: 'Audit trail', href: '/audit', kind: 'Page' },
  { id: 'permissions', label: 'Permissions', href: '/permissions', kind: 'Page' },
  { id: 'account', label: 'My account', href: '/account', kind: 'Page' },
];

/** The navigator: partners are single rows. Their sections are the partner's own tabs. */
export function buildTree(input: TreeInput): TreeSection[] {
  const partners: TreeNode[] = [...input.organizations].sort(byName).map((org) => ({
    id: `partner:${org.id}`,
    label: org.name,
    href: `/partners/${org.id}`,
    meta: org.businessModel ? modelShort(org.businessModel) : 'No model',
    tone: partnerTone(org),
    kind: 'Partner',
  }));

  return [
    { id: 'platform', title: 'Platform', nodes: PLATFORM_PAGES },
    { id: 'partners', title: 'Partners', nodes: partners },
    { id: 'ops', title: 'Across every partner', nodes: OPERATION_PAGES },
  ];
}

/**
 * Everything the palette can jump to, flat. Partners, QR points, printers and
 * people are all here, each with the partner it belongs to, so a search for a
 * printer ID or an email lands on that thing directly.
 */
export function buildSearchIndex(input: TreeInput): TreeNode[] {
  const { organizations, kiosks, printers, users } = input;
  const orgName = (id: string | null | undefined) => organizations.find((o) => o.id === id)?.name ?? '';

  const partners: TreeNode[] = organizations.map((org) => ({
    id: `partner:${org.id}`,
    label: org.name,
    href: `/partners/${org.id}`,
    meta: org.slug,
    tone: partnerTone(org),
    kind: 'Partner',
  }));

  const qrPoints: TreeNode[] = kiosks.map((k) => ({
    id: `kiosk:${k.id}`,
    label: `${k.kioskId} · ${k.name}`,
    href: `/partners/${k.organizationId}/qr-points/${k.id}`,
    meta: orgName(k.organizationId),
    tone: kioskTone(k),
    kind: 'QR point',
  }));

  const printerNodes: TreeNode[] = printers.map((p) => ({
    id: `printer:${p.printerId}`,
    label: p.station.label,
    href: `/partners/${p.organization?.id ?? ''}/printers/${encodeURIComponent(p.printerId)}`,
    meta: p.printerId,
    tone: printerTone(p),
    kind: 'Printer',
  }));

  const people: TreeNode[] = users
    .filter((u) => !u.deletedAt)
    .map((u) => ({
      id: `user:${u.id}`,
      label: u.fullName || u.email,
      href: u.organizationId && u.role !== 'super_admin' ? `/partners/${u.organizationId}/staff/${u.id}` : '/staff',
      meta: u.email,
      tone: u.isActive ? 'ok' : 'muted',
      kind: u.role === 'super_admin' ? 'Platform account' : 'Person',
    }));

  return [...PLATFORM_PAGES, ...OPERATION_PAGES, ...partners, ...qrPoints, ...printerNodes, ...people];
}

function modelShort(id: string): string {
  return BUSINESS_MODELS.find((m) => m.id === id)?.short ?? id;
}

/** Every node in the navigator, flattened. */
export function flattenTree(sections: TreeSection[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children) walk(n.children);
    }
  };
  for (const s of sections) walk(s.nodes);
  return out;
}

/**
 * The ids from the root down to the node for this pathname, so the navigator can
 * highlight the row the operator is on. A partner's sub-pages (printers, staff…)
 * keep their partner highlighted, because they are inside it.
 */
export function activePath(sections: TreeSection[], pathname: string): string[] {
  const found: { trail: string[]; length: number } = { trail: [], length: -1 };

  const walk = (nodes: TreeNode[], trail: string[]) => {
    for (const n of nodes) {
      const here = [...trail, n.id];
      const matches = pathname === n.href || (n.href !== '/' && pathname.startsWith(`${n.href}/`));
      if (matches && n.href.length > found.length) {
        found.trail = here;
        found.length = n.href.length;
      }
      if (n.children) walk(n.children, here);
    }
  };

  for (const s of sections) walk(s.nodes, []);
  return found.trail;
}

/** Whether a node matches the filter. Case-insensitive, over its label and meta. */
export function nodeMatches(node: TreeNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${node.label} ${node.meta ?? ''} ${node.kind ?? ''}`.toLowerCase();
  if (hay.includes(q)) return true;
  return (node.children ?? []).some((c) => nodeMatches(c, q));
}
