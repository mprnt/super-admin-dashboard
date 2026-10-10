import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsp, makeNonce } from '../lib/csp.ts';

const directive = (csp: string, name: string) =>
  csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';

test('scripts run only with this response’s nonce, and never from a third party', () => {
  const csp = buildCsp('abc123==', false);
  const script = directive(csp, 'script-src');
  assert.match(script, /'nonce-abc123=='/);
  assert.match(script, /'strict-dynamic'/);
  assert.doesNotMatch(script, /unsafe-inline/);
  assert.doesNotMatch(script, /unsafe-eval/, 'production never allows eval');
  assert.doesNotMatch(script, /https?:/, 'no external script origins');
});

test('development allows hot reload only, and nothing else gets wider', () => {
  const dev = buildCsp('n', true);
  assert.match(directive(dev, 'script-src'), /'unsafe-eval'/);
  assert.match(directive(dev, 'connect-src'), /ws:/);
  const prod = buildCsp('n', false);
  assert.doesNotMatch(directive(prod, 'connect-src'), /ws:/);
});

test('framing, base and form targets are locked down', () => {
  const csp = buildCsp('n', false);
  assert.equal(directive(csp, 'frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(directive(csp, 'object-src'), "object-src 'none'");
  assert.equal(directive(csp, 'base-uri'), "base-uri 'self'");
  assert.equal(directive(csp, 'form-action'), "form-action 'self'");
});

test('every nonce is fresh and well formed base64', () => {
  const a = makeNonce();
  const b = makeNonce();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9+/]+=*$/);
  assert.equal(atob(a).length, 16);
});
