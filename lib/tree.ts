/**
 * The navigator's tree, built from the four lists the console loads once:
 * partners, QR points, printers and staff. Pure, so the ordering and the
 * parent/child links are tested.
 *
 *   Platform
 *     Overview · Business models · Reports · Queue · Leads
 *   Partners
 *     <Partner>
 *       Overview · Business model · Money · Sessions · Pricing · Attention · Audit
 *       Staff
 *         <Person>                      → owner / manager / viewer
 *       QR points
 *         <QR point>
 *           <Printer>                   → one page per printer
 *   Operations (every partner)
 *     Printers · Staff · Sessions · Pricing · Attention · Audit · Permissions · Account
 */

import type { Kiosk, Organization, Printer, StaffUser } from './types.ts';
import { BUSINESS_MODELS } from './models.ts';

export type Tone = 'ok' | 'warn' | 'bad' | 'muted' | 'amber';

export interface TreeNode {
  id: string;
  label: string;
  href: string;
  /** Small text shown after the label, e.g. a count or an id. */
  meta?: string;
  tone?: Tone;
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

export function buildTree(input: TreeInput): TreeSection[] {
  const { organizations, kiosks, printers, users } = input;

  const partners = [...organizations].sort(byName).map((org) => {
    const orgKiosks = kiosks
      .filter((k) => k.organizationId === org.id)
      .sort((a, b) => a.kioskId.localeCompare(b.kioskId));

    const orgUsers = users
      .filter((u) => u.organizationId === org.id && !u.deletedAt)
      .sort(
        (a, b) =>
          (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
          a.email.localeCompare(b.email)
      );

    const kioskNodes: TreeNode[] = orgKiosks.map((k) => {
      const kioskPrinters = printers
        .filter((p) => p.kiosk.id === k.id)
        .sort((a, b) => a.station.label.localeCompare(b.station.label));

      const node: TreeNode = {
        id: `kiosk:${k.id}`,
        label: `${k.kioskId} · ${k.name}`,
        href: `/partners/${org.id}/qr-points/${k.id}`,
        meta: `${kioskPrinters.length} printer${kioskPrinters.length === 1 ? '' : 's'}`,
        tone: kioskTone(k),
        children: kioskPrinters.map(
          (p): TreeNode => ({
            id: `printer:${p.printerId}`,
            label: p.station.label,
            href: `/partners/${org.id}/printers/${encodeURIComponent(p.printerId)}`,
            meta: p.printerId,
            tone: printerTone(p),
          })
        ),
      };
      return node;
    });

    return {
      id: `partner:${org.id}`,
      label: org.name,
      href: `/partners/${org.id}`,
      meta: org.businessModel ? modelShort(org.businessModel) : 'No model',
      tone: partnerTone(org),
      children: [
        { id: `p:${org.id}:overview`, label: 'Overview', href: `/partners/${org.id}` },
        { id: `p:${org.id}:model`, label: 'Business model', href: `/partners/${org.id}/model` },
        {
          id: `p:${org.id}:staff`,
          label: 'Staff',
          href: `/partners/${org.id}/staff`,
          meta: String(orgUsers.length),
          children: orgUsers.map(
            (u): TreeNode => ({
              id: `user:${u.id}`,
              label: u.fullName || u.email,
              href: `/partners/${org.id}/staff/${u.id}`,
              meta: u.role,
              tone: u.isActive ? 'ok' : 'muted',
            })
          ),
        },
        {
          id: `p:${org.id}:qr`,
          label: 'QR points',
          href: `/partners/${org.id}/qr-points`,
          meta: String(orgKiosks.length),
          children: kioskNodes,
        },
        { id: `p:${org.id}:money`, label: 'Money', href: `/partners/${org.id}/money` },
        { id: `p:${org.id}:sessions`, label: 'Sessions', href: `/partners/${org.id}/sessions` },
        { id: `p:${org.id}:pricing`, label: 'Pricing', href: `/partners/${org.id}/pricing` },
        { id: `p:${org.id}:attention`, label: 'Attention', href: `/partners/${org.id}/attention` },
        { id: `p:${org.id}:audit`, label: 'Audit', href: `/partners/${org.id}/audit` },
      ],
    };
  });

  return [
    {
      id: 'platform',
      title: 'Platform',
      nodes: [
        { id: 'overview', label: 'Overview', href: '/' },
        { id: 'models', label: 'Business models', href: '/business-models' },
        { id: 'reports', label: 'Partner comparison', href: '/reports' },
        { id: 'queue', label: 'Print queue', href: '/queue' },
        { id: 'leads', label: 'Leads', href: '/leads' },
      ],
    },
    {
      id: 'partners',
      title: 'Partners',
      nodes: partners,
    },
    {
      id: 'ops',
      title: 'Across every partner',
      nodes: [
        { id: 'all-printers', label: 'Printers', href: '/printers', meta: String(printers.length) },
        {
          id: 'all-staff',
          label: 'Staff and platform accounts',
          href: '/staff',
          meta: String(users.filter((u) => !u.deletedAt).length),
        },
        { id: 'all-sessions', label: 'Sessions', href: '/sessions' },
        { id: 'all-pricing', label: 'Pricing', href: '/pricing' },
        { id: 'all-attention', label: 'Attention', href: '/attention' },
        { id: 'all-audit', label: 'Audit trail', href: '/audit' },
        { id: 'permissions', label: 'Permissions', href: '/permissions' },
        { id: 'account', label: 'My account', href: '/account' },
      ],
    },
  ];
}

function modelShort(id: string): string {
  return BUSINESS_MODELS.find((m) => m.id === id)?.short ?? id;
}

/** Every node in the tree, flattened, for the command palette and search. */
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
 * The ids from the root down to the node for this pathname, so the navigator
 * can open the branch the operator is on. The deepest exact-or-prefix match
 * wins: `/partners/x/staff/y` is the person, not the partner it belongs to.
 */
export function activePath(sections: TreeSection[], pathname: string): string[] {
  const found: { trail: string[]; length: number } = { trail: [], length: -1 };

  const walk = (nodes: TreeNode[], trail: string[]) => {
    for (const n of nodes) {
      const here = [...trail, n.id];
      const matches = pathname === n.href || (n.href !== '/' && pathname.startsWith(`${n.href}/`));
      if (matches && n.href.length >= found.length) {
        found.trail = here;
        found.length = n.href.length;
      }
      if (n.children) walk(n.children, here);
    }
  };

  for (const s of sections) walk(s.nodes, []);
  return found.trail;
}

/** Whether a node or any of its descendants matches the query. Case-insensitive. */
export function nodeMatches(node: TreeNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${node.label} ${node.meta ?? ''}`.toLowerCase();
  if (hay.includes(q)) return true;
  return (node.children ?? []).some((c) => nodeMatches(c, q));
}
