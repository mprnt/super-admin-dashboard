import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partnerReadiness } from '../lib/readiness.ts';
import type { Kiosk, Organization, PriceList, Printer, StaffUser } from '../lib/types.ts';

const ORG = 'org-1';

const org = (extra: Partial<Organization> = {}): Organization => ({
  id: ORG,
  name: 'Sharma Stores',
  slug: 'sharma-stores',
  status: 'active',
  businessModel: 'integration',
  timezone: 'Asia/Kolkata',
  contactEmail: 'owner@sharma.com',
  contactPhone: '+919876543210',
  contactUpdatedBy: 'shop',
  contactUpdatedAt: null,
  payout: { bankAccountHolder: 'Sharma', bankName: 'HDFC', bankIfsc: 'HDFC0001234', bankAccountLast4: '9012', upiId: 'sharma@hdfc', updatedBy: 'shop', updatedAt: null },
  createdAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const kiosk = (status = 'active'): Kiosk => ({
  id: 'k-1', kioskId: 'SH01', name: 'Counter', location: 'Front', status, organizationId: ORG, organizationName: null, printersOnline: 1, printersTotal: 1,
});

const printer = (extra: Partial<Printer> = {}): Printer =>
  ({
    printerId: 'RPI_1',
    name: 'Front',
    status: 'online',
    silent: false,
    kiosk: { id: 'k-1', code: 'SH01', name: 'Counter' },
    organization: { id: ORG, name: 'Sharma Stores' },
    enrollment: { revokedAt: null },
    ...extra,
  }) as unknown as Printer;

const owner = (extra: Partial<StaffUser> = {}): StaffUser => ({
  id: 'u-1', email: 'owner@sharma.com', fullName: null, role: 'owner', organizationId: ORG, organizationName: null,
  isActive: true, mustChangePassword: false, lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z', deletedAt: null, ...extra,
});

const rate = (organizationId: string | null): PriceList => ({
  id: `pl-${organizationId}`, scope: organizationId ? 'organization' : 'platform', organizationId, organizationName: null, kioskId: null, kioskCode: null,
  bwPerPage: 1.5, colorPerPage: 4, minCharge: 0, effectiveFrom: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', createdBy: 'shop',
});

test('a partner with everything in place is fully ready', () => {
  const r = partnerReadiness(org(), { kiosks: [kiosk()], printers: [printer()], users: [owner()], priceLists: [rate(ORG)] });
  assert.equal(r.done, r.total);
  assert.deepEqual(r.missing, []);
});

test('a new partner shows exactly what is missing', () => {
  const bare = org({
    contactPhone: null,
    payout: { bankAccountHolder: null, bankName: null, bankIfsc: null, bankAccountLast4: null, upiId: null, updatedBy: null, updatedAt: null },
  });
  const r = partnerReadiness(bare, { kiosks: [], printers: [], users: [], priceLists: [rate(null)] });
  assert.deepEqual(
    r.missing.map((c) => c.key),
    ['contact', 'bank', 'upi', 'rates', 'qr', 'printer', 'online', 'owner']
  );
  assert.equal(r.checks.find((c) => c.key === 'contact')?.detail, 'No phone');
  assert.equal(r.checks.find((c) => c.key === 'rates')?.detail, 'On the MPRNT default');
});

test('a revoked printer does not count, and a silent one is not online', () => {
  const r = partnerReadiness(org(), {
    kiosks: [kiosk()],
    printers: [printer({ enrollment: { revokedAt: '2026-02-01T00:00:00Z' } } as Partial<Printer>), printer({ printerId: 'RPI_2', silent: true })],
    users: [owner()],
    priceLists: [rate(ORG)],
  });
  assert.equal(r.checks.find((c) => c.key === 'printer')?.detail, '1 enrolled');
  assert.equal(r.checks.find((c) => c.key === 'online')?.done, false);
});

test('another partner\'s rate, a removed owner and an inactive QR point do not count', () => {
  const r = partnerReadiness(org(), {
    kiosks: [kiosk('inactive')],
    printers: [printer()],
    users: [owner({ deletedAt: '2026-02-01T00:00:00Z' })],
    priceLists: [rate('someone-else')],
  });
  assert.deepEqual(r.missing.map((c) => c.key), ['rates', 'qr', 'owner']);
});
