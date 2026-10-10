import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activePath, buildTree, flattenTree, nodeMatches, type TreeSection } from '../lib/tree.ts';
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
    printer('RPI_A', K1, ORG_A, 'Counter A', { station: { isStation: true, name: 'Front desk', label: 'Front desk' } }),
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

test('partners are listed by name, and a suspended one is marked', () => {
  assert.deepEqual(partners.map((n) => n.label), ['Alpha Print', 'Zeta Print']);
  assert.equal(alpha.tone, 'bad');
  assert.equal(alpha.meta, 'Model 2A');
});

test('a partner with no model shows that, not a blank', () => {
  const zeta = partners.find((n) => n.id === `partner:${ORG_B}`)!;
  assert.equal(zeta.meta, 'No model');
});

test('staff are ordered by role then email, and removed accounts are hidden', () => {
  const staff = alpha.children!.find((c) => c.id === `p:${ORG_A}:staff`)!;
  assert.deepEqual(
    staff.children!.map((c) => c.id),
    ['user:u-owner', 'user:u-viewer'],
    'owner first, removed manager gone'
  );
  assert.equal(staff.meta, '2', 'the count matches what is shown');
});

test('QR points are sorted by code and each holds its own printers', () => {
  const qr = alpha.children!.find((c) => c.id === `p:${ORG_A}:qr`)!;
  assert.deepEqual(qr.children!.map((c) => c.label), ['S1 · Desk S1', 'S2 · Desk S2']);
  const s1 = qr.children![0]!;
  assert.deepEqual(s1.children!.map((c) => c.label), ['Counter B', 'Front desk'], 'printers sorted by label');
});

test('every printer links to its own page, under its partner', () => {
  const qr = alpha.children!.find((c) => c.id === `p:${ORG_A}:qr`)!;
  const printerNode = qr.children![0]!.children![0]!;
  assert.equal(printerNode.href, `/partners/${ORG_A}/printers/RPI_B`);
  assert.equal(printerNode.tone, 'ok');
  const station = qr.children![0]!.children![1]!;
  assert.equal(station.href, `/partners/${ORG_A}/printers/RPI_A`);
});

test('an offline printer is a warning, a revoked one is an error', () => {
  const offline = flattenTree(sections).find((n) => n.id === 'printer:RPI_OFF')!;
  assert.equal(offline.tone, 'warn');
  const revokedTree = buildTree({ ...input, printers: [printer('RPI_R', K1, ORG_A, 'Gone', { enrollment: { keyPrefix: null, keyIssuedAt: null, enrolled: false, revokedAt: '2026-03-01', lastSeenIp: null } })] });
  const r = flattenTree(revokedTree).find((n) => n.id === 'printer:RPI_R')!;
  assert.equal(r.tone, 'bad');
});

test('the platform section and the across-every-partner section are present', () => {
  const titles = sections.map((s) => s.title);
  assert.deepEqual(titles, ['Platform', 'Partners', 'Across every partner']);
  const ops = sections[2]!.nodes.map((n) => n.href);
  assert.ok(ops.includes('/printers') && ops.includes('/staff') && ops.includes('/permissions'));
});

test('the active branch is found from the deepest matching page', () => {
  assert.deepEqual(
    activePath(sections, `/partners/${ORG_A}/staff/u-owner`).slice(-1),
    ['user:u-owner'],
    'the person, not the partner it belongs to'
  );
  const trail = activePath(sections, `/partners/${ORG_A}/printers/RPI_A`);
  assert.equal(trail.length, 4, 'partner, QR points, the QR point, the printer');
  assert.equal(trail[0], `partner:${ORG_A}`);
  assert.equal(trail[trail.length - 1], 'printer:RPI_A');
});

test('a partner overview page is on the partner node itself', () => {
  const trail = activePath(sections, `/partners/${ORG_A}`);
  assert.equal(trail.length, 2, 'partner, then its Overview leaf');
  assert.equal(trail[trail.length - 1], `p:${ORG_A}:overview`);
});

test('an unknown path has no active branch', () => {
  assert.deepEqual(activePath(sections, '/nowhere/at/all'), []);
});

test('the filter keeps a branch when a descendant matches, and matches are case-insensitive', () => {
  assert.equal(nodeMatches(alpha, 'front DESK'), true, 'a station deep inside');
  assert.equal(nodeMatches(alpha, 'zeta'), false);
  assert.equal(nodeMatches(alpha, ''), true);
});

test('the list of every node is complete enough for the command palette', () => {
  const all = flattenTree(sections);
  assert.ok(all.some((n) => n.id === `user:u-viewer`));
  assert.ok(all.some((n) => n.id === 'printer:RPI_B'));
  assert.ok(all.some((n) => n.href === '/audit'));
});

test('sections are typed as the navigator expects', () => {
  const s: TreeSection[] = sections;
  assert.equal(s.length, 3);
});
