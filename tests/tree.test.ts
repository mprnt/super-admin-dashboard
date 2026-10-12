import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePath, buildSearchIndex, buildTree, flattenTree, nodeMatches } from '../lib/tree.ts';
import type { Kiosk, Organization, Printer, StaffUser } from '../lib/types.ts';

const org = (id: string, name: string, extra: Partial<Organization> = {}): Organization => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  status: 'active',
  businessModel: null,
  timezone: 'Asia/Kolkata',
  contactEmail: null,
  contactPhone: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const kiosk = (id: string, orgId: string, code: string): Kiosk => ({
  id,
  kioskId: code,
  name: `Desk ${code}`,
  location: 'Front',
  status: 'active',
  organizationId: orgId,
  organizationName: null,
  printersOnline: 0,
  printersTotal: 0,
});

const printer = (printerId: string, kioskUuid: string, orgId: string, label: string, extra: Partial<Printer> = {}): Printer => ({
  printerId,
  name: label,
  status: 'online',
  kiosk: { id: kioskUuid, code: 'K', name: null },
  organization: { id: orgId, name: null },
  enrollment: { keyPrefix: 'mpk_', keyIssuedAt: null, enrolled: true, revokedAt: null, lastSeenIp: null },
  station: { isStation: false, name: null, label },
  lastHeartbeat: null,
  secondsSinceHeartbeat: 5,
  silent: false,
  activeJobs: 0,
  paperLevel: null,
  inkLevelBlack: null,
  capabilities: { color: true, doubleSided: false },
  ...extra,
});

const user = (id: string, orgId: string | null, role: StaffUser['role'], email: string, extra: Partial<StaffUser> = {}): StaffUser => ({
  id,
  email,
  fullName: null,
  role,
  organizationId: orgId,
  organizationName: null,
  isActive: true,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  ...extra,
});

const ORG_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ORG_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const K1 = 'k1000000-0000-4000-8000-000000000001';
const K2 = 'k2000000-0000-4000-8000-000000000002';

const input = {
  organizations: [org(ORG_B, 'Zeta Print'), org(ORG_A, 'Alpha Print', { businessModel: 'revenue-share', status: 'suspended' })],
  kiosks: [kiosk(K2, ORG_A, 'S2'), kiosk(K1, ORG_A, 'S1')],
  printers: [
    printer('RPI_B', K1, ORG_A, 'Counter B', { status: 'busy' }),
    printer('RPI_A', K1, ORG_A, 'Front desk', { station: { isStation: true, name: 'Front desk', label: 'Front desk' } }),
    printer('RPI_OFF', K2, ORG_A, 'Desk', { status: 'offline' }),
  ],
  users: [
    user('u-viewer', ORG_A, 'viewer', 'zed@alpha.test'),
    user('u-owner', ORG_A, 'owner', 'owen@alpha.test', { fullName: 'Owen' }),
    user('u-gone', ORG_A, 'manager', 'gone@alpha.test', { deletedAt: '2026-02-01T00:00:00Z' }),
    user('u-other', ORG_B, 'owner', 'beta@zeta.test'),
  ],
};

const sections = buildTree(input);
const partners = sections.find((s) => s.id === 'partners')!.nodes;
const alpha = partners.find((n) => n.id === `partner:${ORG_A}`)!;

test('the navigator has three sections: platform pages, partners, and everything across partners', () => {
  assert.deepEqual(sections.map((s) => s.title), ['Platform', 'Partners', 'Across every partner']);
});

test('a partner is a single row: its sections live in the partner tabs, not the navigator', () => {
  assert.deepEqual(partners.map((n) => n.label), ['Alpha Print', 'Zeta Print'], 'sorted by name');
  for (const node of partners) assert.equal(node.children, undefined, `${node.label} has no sub-items`);
  assert.equal(alpha.href, `/partners/${ORG_A}`);
  assert.equal(alpha.tone, 'bad', 'a suspended partner is marked');
  assert.equal(alpha.meta, 'Model 2A');
});

test('a partner with no model shows that, not a blank', () => {
  const zeta = partners.find((n) => n.id === `partner:${ORG_B}`)!;
  assert.equal(zeta.meta, 'No model');
});

test('the navigator no longer lists a partner’s staff, QR points or printers', () => {
  const navigatorIds = flattenTree(sections).map((n) => n.id);
  assert.equal(navigatorIds.some((id) => id.startsWith('printer:') || id.startsWith('user:') || id.startsWith('kiosk:')), false);
});

test('the search index still reaches printers, people, QR points and partners directly', () => {
  const index = buildSearchIndex(input);
  const printerHit = index.find((n) => n.id === 'printer:RPI_B')!;
  assert.equal(printerHit.href, `/partners/${ORG_A}/printers/RPI_B`);
  assert.equal(printerHit.kind, 'Printer');
  const personHit = index.find((n) => n.id === 'user:u-owner')!;
  assert.equal(personHit.href, `/partners/${ORG_A}/staff/u-owner`);
  assert.ok(index.some((n) => n.id === `kiosk:${K1}` && n.href === `/partners/${ORG_A}/qr-points/${K1}`));
  assert.ok(index.some((n) => n.id === `partner:${ORG_B}`));
  assert.equal(index.some((n) => n.id === 'user:u-gone'), false, 'a removed account is not searchable');
});

test('the active row is the partner for every page inside it, and the page itself on its own route', () => {
  assert.deepEqual(activePath(sections, `/partners/${ORG_A}/printers/RPI_A`), [`partner:${ORG_A}`]);
  assert.deepEqual(activePath(sections, `/partners/${ORG_A}`), [`partner:${ORG_A}`]);
  assert.deepEqual(activePath(sections, '/printers'), ['all-printers']);
  assert.deepEqual(activePath(sections, '/nowhere/at/all'), []);
});

test('the filter matches a partner by name, model or kind', () => {
  assert.equal(nodeMatches(alpha, 'alpha'), true);
  assert.equal(nodeMatches(alpha, 'model 2a'), true);
  assert.equal(nodeMatches(alpha, 'zeta'), false);
  assert.equal(nodeMatches(alpha, ''), true);
});
