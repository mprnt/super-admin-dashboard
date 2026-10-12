import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitRevenue } from '../lib/revenue.ts';
import type { SessionRow } from '../lib/types.ts';

const job = (id: string, printer: string | null, amount: number, status = 'completed', paymentStatus = 'paid'): SessionRow => ({
  jobId: id,
  sessionCode: null,
  kiosk: { code: 'S1', name: null },
  printer: printer ? { id: printer, name: printer } : null,
  createdAt: '2026-10-08T00:00:00Z',
  completedAt: null,
  status,
  paymentStatus,
  settings: { colorMode: 'bw', printSides: 'single', copies: 1 },
  pages: { charged: 1, printed: 1, sheets: 1 },
  amount,
  pricePerPage: amount,
  durationSeconds: null,
  errorMessage: null,
});

const PRINTERS = [
  { printerId: 'A', name: 'Counter A' },
  { printerId: 'B', name: 'Counter B' },
  { printerId: 'C', name: 'Spare' },
];

test('paid jobs add up to the partner total, split by printer', () => {
  const split = splitRevenue([job('1', 'A', 26), job('2', 'B', 42), job('3', 'B', 10)], PRINTERS);
  assert.equal(split.revenue, 78);
  assert.equal(split.paidJobs, 3);
  assert.deepEqual(
    split.byPrinter.map((r) => [r.printerId, r.revenue]),
    [['B', 52], ['A', 26], ['C', 0]],
    'highest first, a printer with no work still listed at 0'
  );
  assert.equal(split.reconciles, true);
});

test('a paid job that never reached a printer is reported on its own, not dropped', () => {
  const split = splitRevenue([job('1', 'A', 26), job('2', null, 35, 'failed')], PRINTERS);
  assert.equal(split.revenue, 61);
  assert.deepEqual(split.unattributed, { paidJobs: 1, revenue: 35 });
  assert.equal(split.byPrinter.find((r) => r.printerId === 'A')?.revenue, 26);
  assert.equal(split.reconciles, true, 'printers plus the unattributed rest equal the total');
});

test('unpaid jobs count for nothing', () => {
  const split = splitRevenue([job('1', 'A', 26), job('2', 'A', 99, 'failed', 'pending')], PRINTERS);
  assert.equal(split.revenue, 26);
  assert.equal(split.paidJobs, 1);
});

test('printed and failed counts are per printer, and the shares add to 100', () => {
  const split = splitRevenue([job('1', 'A', 50), job('2', 'A', 50, 'failed'), job('3', 'B', 100)], PRINTERS);
  const a = split.byPrinter.find((r) => r.printerId === 'A')!;
  assert.equal(a.paidJobs, 2);
  assert.equal(a.printed, 1);
  assert.equal(a.share, 50, 'a failed job that was paid still counts for its printer');
  const b = split.byPrinter.find((r) => r.printerId === 'B')!;
  assert.equal(b.share, 50);
});

test('a printer missing from the list still gets its work, under its own id', () => {
  const split = splitRevenue([job('1', 'GONE', 12)], PRINTERS);
  const gone = split.byPrinter.find((r) => r.printerId === 'GONE');
  assert.ok(gone);
  assert.equal(gone?.revenue, 12);
});

test('no paid work gives no shares, not a divide by zero', () => {
  const split = splitRevenue([job('1', 'A', 0, 'failed', 'pending')], PRINTERS);
  assert.equal(split.revenue, 0);
  assert.equal(split.byPrinter[0]?.share, null);
});
