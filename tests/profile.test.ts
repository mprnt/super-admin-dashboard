import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProfile } from '../lib/profile.ts';

const good = { id: 'u1', email: 'ops@mprnt.test', role: 'super_admin', mustChangePassword: false };

test('a well-formed profile parses', () => {
  assert.deepEqual(parseProfile(JSON.stringify(good)), good);
});

test('a percent-encoded profile also parses, as the cookie API can return either', () => {
  assert.deepEqual(parseProfile(encodeURIComponent(JSON.stringify(good))), good);
});

test('missing, malformed or incomplete profiles yield nothing', () => {
  assert.equal(parseProfile(undefined), null);
  assert.equal(parseProfile(''), null);
  assert.equal(parseProfile('{not json'), null);
  assert.equal(parseProfile('"a string"'), null);
  assert.equal(parseProfile(JSON.stringify({ id: 'u1', email: 'x' })), null, 'no role');
});

test('mustChangePassword is true only when it is exactly true', () => {
  assert.equal(parseProfile(JSON.stringify({ ...good, mustChangePassword: 'yes' }))?.mustChangePassword, false);
  assert.equal(parseProfile(JSON.stringify({ ...good, mustChangePassword: true }))?.mustChangePassword, true);
});
