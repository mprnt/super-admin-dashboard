import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkJsonBody,
  classifyRefreshStatus,
  checkQuery,
  createSingleFlight,
  isCrossSiteRequest,
  isPlatformRoute,
  isSameOriginRequest,
  isUnsafeMethod,
  resolvePlatformUrl,
  safeNextPath,
} from '../lib/gate.ts';

const BASE = 'https://api.example.test/api/v1';
const ORG = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const USER = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';

// Next hands catch-all segments over already decoded, so `%2e%2e` arrives as '..'.
const decode = (p: string) => p.split('/').map(decodeURIComponent);

test('the route allowlist admits what the console calls', () => {
  const allowed: [string, string[]][] = [
    ['GET', ['organizations']],
    ['POST', ['organizations']],
    ['GET', ['organizations', ORG]],
    ['PATCH', ['organizations', ORG]],
    ['DELETE', ['organizations', ORG]],
    ['POST', ['organizations', ORG, 'status']],
    ['POST', ['organizations', ORG, 'kiosks']],
    ['POST', ['printers', 'enroll']],
    ['PATCH', ['printers', 'RPI_M002_01']],
    ['POST', ['printers', 'RPI_M002_01', 'rotate-key']],
    ['POST', ['printers', 'RPI_M002_01', 'revoke']],
    ['PUT', ['users', USER, 'permissions']],
    ['POST', ['print-jobs', ORG, 'refund']],
    ['GET', ['revenue-split']],
    ['GET', ['revenue-split', 'summary']],
    ['POST', ['revenue-split']],
    ['GET', ['reports', 'sessions', 'export']],
    ['GET', ['auth', 'me']],
    ['POST', ['auth', 'change-password']],
  ];
  for (const [method, segments] of allowed) {
    assert.ok(isPlatformRoute(method, segments), `${method} ${segments.join('/')} should be allowed`);
  }
});

test('the allowlist refuses everything else, including shop-only and auth routes', () => {
  const refused: [string, string[]][] = [
    ['POST', ['auth', 'login']], // the console signs in through its own route
    ['POST', ['auth', 'refresh']], // refresh is server-only
    ['POST', ['auth', 'logout']], // logout is server-only
    ['GET', ['shop']], // a shop's own profile: not a platform call
    ['GET', ['kiosks', 'anything', 'else']],
    ['DELETE', ['printers', 'RPI_M002_01']], // no delete route exists
    ['GET', ['organizations', 'not-a-uuid']], // ids are typed, not free text
    ['GET', ['organizations', `${ORG}/extra`]],
    ['GET', ['organizations', ORG, 'status']], // status is POST only
    ['PATCH', ['users']], // collection-level patch does not exist
    ['GET', ['printers', 'enroll']], // enrol is POST only
    ['DELETE', ['users', USER, 'permissions']], // PUT is the only write
    ['GET', ['queue', 'status', 'extra']],
    ['GET', ['unknown']],
    ['DELETE', ['revenue-split']], // a term is never removed; the history is append-only
    ['PATCH', ['revenue-split']], // ...nor edited
    ['PUT', ['revenue-split']],
    ['POST', ['revenue-split', 'summary']], // the summary is read-only
    ['GET', []],
  ];
  for (const [method, segments] of refused) {
    assert.equal(isPlatformRoute(method, segments), false, `${method} ${segments.join('/')} must be refused`);
  }
});

test('the allowlist is case-sensitive on the verb and exact on the path', () => {
  assert.equal(isPlatformRoute('get', ['organizations']), true, 'verb is normalised');
  assert.equal(isPlatformRoute('GET', ['Organizations']), false);
  assert.equal(isPlatformRoute('GET', ['organizations/']), false);
});

test('traversal out of /admin is refused at the URL level', () => {
  for (const raw of [
    'admin/%2e%2e/payments',
    'admin/%2E%2E/%2e%2e/health',
    'admin/../payments',
    'admin/%2e',
    'admin/organizations/%2e%2e/%2e%2e/health',
  ]) {
    assert.equal(resolvePlatformUrl(BASE, decode(raw).slice(1)), null, raw);
  }
});

test('encoded separators and empty or control segments are refused', () => {
  for (const segs of [
    ['..%2fpayments'],
    ['a/b'],
    ['a\\..\\b'],
    ['%2e%2e'],
    [''],
    ['x\u0000'],
    ['x\u007f'],
  ]) {
    assert.equal(resolvePlatformUrl(BASE, segs), null, JSON.stringify(segs));
  }
});

test('a legitimate path resolves under /admin on the configured origin', () => {
  assert.equal(
    resolvePlatformUrl(BASE, ['organizations', ORG], '?period=month')?.toString(),
    `${BASE}/admin/organizations/${ORG}?period=month`
  );
  assert.equal(resolvePlatformUrl(BASE, [])?.toString(), undefined);
});

test('query parameters: known and well formed pass, unknown and repeated are refused', () => {
  assert.deepEqual(checkQuery(''), { ok: true, search: '' });
  assert.deepEqual(checkQuery(`?organizationId=${ORG}&period=month&limit=50`), {
    ok: true,
    search: `?organizationId=${ORG}&period=month&limit=50`,
  });

  // Unknown parameter: the most common way to try to reach a tenant selector a route does not expect.
  assert.equal(checkQuery('?tenantId=x').ok, false);
  assert.equal(checkQuery('?organization_id=x').ok, false);

  // A second organizationId is a parameter-pollution attempt: refused, not forwarded.
  assert.equal(checkQuery(`?organizationId=${ORG}&organizationId=${USER}`).ok, false);
});

test('query values must match their rule', () => {
  for (const bad of [
    '?organizationId=not-a-uuid',
    '?period=decade',
    '?from=yesterday',
    '?limit=abc',
    '?limit=99999',
    '?businessModel=free',
    '?action=DROP%20TABLE',
    '?category=everything',
    `?search=${'x'.repeat(256)}`,
    '?printerId=a%2Fb',
  ]) {
    assert.equal(checkQuery(bad).ok, false, bad);
  }
});

test('query values that are well formed are accepted', () => {
  for (const good of [
    '?period=week',
    '?from=2026-10-01&to=2026-10-10',
    '?from=2026-10-01T00:00:00Z',
    '?businessModel=none',
    '?actorScope=platform',
    '?category=security',
    '?action=admin.login_failed',
    '?printerId=RPI_M002_01',
    '?includeDeleted=true',
    '?status=printing',
  ]) {
    assert.equal(checkQuery(good).ok, true, good);
  }
});

test('malformed query strings are refused', () => {
  assert.equal(checkQuery('period=month').ok, false, 'no leading ?');
});

test('a JSON body must be a JSON object and within the size cap', () => {
  assert.deepEqual(checkJsonBody('application/json', '{"a":1}'), { ok: true });
  assert.deepEqual(checkJsonBody(null, undefined), { ok: true });
  assert.equal(checkJsonBody('text/plain', '{"a":1}').ok, false, 'non-JSON content type');
  assert.equal(checkJsonBody('application/json', '[1,2]').ok, false, 'array is not an object');
  assert.equal(checkJsonBody('application/json', '"s"').ok, false, 'string is not an object');
  assert.equal(checkJsonBody('application/json', '{bad').ok, false, 'invalid JSON');
  assert.equal(checkJsonBody('application/json', `{"a":"${'x'.repeat(70_000)}"}`).ok, false, 'too large');
});

test('same-origin: Origin or Referer must name this host', () => {
  const host = 'admin.mprnt.test';
  assert.equal(isSameOriginRequest({ host, origin: `https://${host}` }), true);
  assert.equal(isSameOriginRequest({ host, referer: `https://${host}/partners` }), true);
  assert.equal(isSameOriginRequest({ host, origin: 'https://evil.test' }), false);
  assert.equal(isSameOriginRequest({ host, origin: 'null' }), false, 'opaque origin');
  assert.equal(isSameOriginRequest({ host }), false, 'no Origin and no Referer');
  assert.equal(isSameOriginRequest({ origin: `https://${host}` }), false, 'no host');
  assert.equal(isSameOriginRequest({ host: 'admin.mprnt.test, other', origin: 'https://admin.mprnt.test' }), true);
});

test('only state-changing methods need the origin check', () => {
  for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) assert.equal(isUnsafeMethod(m), true, m);
  for (const m of ['GET', 'HEAD', 'OPTIONS']) assert.equal(isUnsafeMethod(m), false, m);
});

test('post-sign-in destination only ever stays on this site', () => {
  assert.equal(safeNextPath('/partners/x'), '/partners/x');
  assert.equal(safeNextPath('/printers?state=offline'), '/printers?state=offline');
  for (const bad of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '', null, undefined]) {
    assert.equal(safeNextPath(bad as string), '/', String(bad));
  }
});

test('single-flight: concurrent callers share one refresh', async () => {
  const run = createSingleFlight<string>(1000);
  let calls = 0;
  const work = () =>
    new Promise<string>((resolve) => {
      calls += 1;
      setTimeout(() => resolve('tokens'), 5);
    });
  const [a, b, c] = await Promise.all([run('rt', work), run('rt', work), run('rt', work)]);
  assert.equal(calls, 1);
  assert.deepEqual([a, b, c], ['tokens', 'tokens', 'tokens']);
});

test('single-flight: a failed refresh is not remembered', async () => {
  const run = createSingleFlight<string>(1000);
  await assert.rejects(run('rt', () => Promise.reject(new Error('boom'))));
  const ok = await run('rt', () => Promise.resolve('fresh'));
  assert.equal(ok, 'fresh');
});

test('a cross-site browser request is refused; same-site, none and absent are not', () => {
  assert.equal(isCrossSiteRequest('cross-site'), true);
  assert.equal(isCrossSiteRequest('CROSS-SITE'), true);
  assert.equal(isCrossSiteRequest('same-origin'), false);
  assert.equal(isCrossSiteRequest('same-site'), false);
  assert.equal(isCrossSiteRequest('none'), false, 'typed address bar navigation');
  assert.equal(isCrossSiteRequest(null), false, 'no header from a non-browser client');
});

test('only a refused refresh token ends the session; a busy backend does not', () => {
  for (const status of [400, 401, 403]) assert.equal(classifyRefreshStatus(status), 'rejected', String(status));
  for (const status of [429, 500, 502, 503, 504]) assert.equal(classifyRefreshStatus(status), 'unavailable', String(status));
});
