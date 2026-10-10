import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionLabel, ago, count, duration, money, percent, shortDate, titleCase } from '../lib/format.ts';

test('money is rupees with Indian grouping, and a dash when there is no value', () => {
  assert.equal(money(1234.5), '₹1,234.50');
  assert.equal(money(0), '₹0.00');
  assert.equal(money(null), '—');
  assert.equal(money(undefined), '—');
  assert.equal(money(Number.NaN), '—');
});

test('counts and percentages', () => {
  assert.equal(count(1234567), '12,34,567');
  assert.equal(count(null), '—');
  assert.equal(percent(12.345), '+12.3%');
  assert.equal(percent(-4), '-4.0%');
  assert.equal(percent(null), '—');
});

test('durations read naturally, from seconds to hours', () => {
  assert.equal(duration(38), '38s');
  assert.equal(duration(249), '4m 09s');
  assert.equal(duration(3840), '1h 04m');
  assert.equal(duration(-5), '0s');
  assert.equal(duration(null), '—');
});

test('relative ages', () => {
  assert.equal(ago(30), '30s ago');
  assert.equal(ago(600), '10 min ago');
  assert.equal(ago(7200), '2 h ago');
  assert.equal(ago(3 * 86400), '3 days ago');
});

test('a bare date stays the date it is, whatever the host timezone', () => {
  assert.equal(shortDate('2026-10-10'), '10 Oct 2026');
  assert.equal(shortDate('2026-01-01'), '01 Jan 2026');
});

test('audit action names become readable', () => {
  assert.equal(actionLabel('admin.login_failed'), 'Admin · login failed');
  assert.equal(actionLabel('printer.key_rotated'), 'Printer · key rotated');
  assert.equal(actionLabel('organization.model_changed'), 'Organization · model changed');
  assert.equal(actionLabel('payment.refunded'), 'Payment · refunded');
});

test('titleCase handles snake and kebab identifiers', () => {
  assert.equal(titleCase('revenue-share'), 'Revenue Share');
  assert.equal(titleCase('full_purchase'), 'Full Purchase');
});
