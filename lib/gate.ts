/**
 * The platform console's request gate. Pure functions only (no Next imports),
 * so the same rules run in the proxy, the auth routes and `node --test`.
 *
 * Three layers sit between the browser and the backend:
 *
 *  1. ROUTES - an exact list of method + path templates. Anything else is a
 *     404, identical to an unknown route, so the proxy cannot be used to map
 *     which platform endpoints exist. There is no catch-all.
 *  2. QUERY  - each parameter the console may send has a rule. An unknown or
 *     repeated parameter is refused, not forwarded.
 *  3. ORIGIN - every state-changing request must come from this host.
 *
 * None of this is what keeps a shop out of platform data. The backend's
 * requireSuperAdmin does that, from the token. This gate makes sure the console
 * cannot be a route to anything the console does not use, and that a mistake
 * in the console is not also a way around the backend's checks.
 */

/** Path segments are matched one by one. `:uuid` and `:printer` are typed. */
type Template = string;

const UUID_SEGMENT = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const PRINTER_SEGMENT = /^[A-Za-z0-9_-]{3,64}$/;

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Every backend route the platform console calls, relative to /admin. */
export const PLATFORM_ROUTES: ReadonlyArray<readonly [Method, Template]> = [
  // Own account
  ['GET', 'auth/me'],
  ['POST', 'auth/change-password'],

  // Partners (organizations)
  ['GET', 'organizations'],
  ['POST', 'organizations'],
  ['GET', 'organizations/:uuid'],
  ['PATCH', 'organizations/:uuid'],
  ['DELETE', 'organizations/:uuid'],
  ['POST', 'organizations/:uuid/status'],
  ['POST', 'organizations/:uuid/kiosks'],

  // QR points (kiosks)
  ['GET', 'kiosks'],
  ['POST', 'kiosks'],
  ['PATCH', 'kiosks/:uuid'],

  // Printers
  ['GET', 'printers'],
  ['POST', 'printers/enroll'],
  ['PATCH', 'printers/:printer'],
  ['POST', 'printers/:printer/rotate-key'],
  ['POST', 'printers/:printer/revoke'],

  // Staff and their permissions
  ['GET', 'users'],
  ['POST', 'users'],
  ['GET', 'users/:uuid'],
  ['PATCH', 'users/:uuid'],
  ['DELETE', 'users/:uuid'],
  ['POST', 'users/:uuid/reset-password'],
  ['POST', 'users/:uuid/unlock'],
  ['GET', 'users/:uuid/permissions'],
  ['PUT', 'users/:uuid/permissions'],
  ['GET', 'permissions'],

  // Reports and operations
  ['GET', 'reports/summary'],
  ['GET', 'reports/series'],
  ['GET', 'reports/kiosks'],
  ['GET', 'reports/sessions'],
  ['GET', 'reports/sessions/export'],
  ['GET', 'reports/organizations'],
  ['GET', 'queue/status'],
  ['GET', 'attention'],
  ['POST', 'print-jobs/:uuid/refund'],

  // Pricing
  ['GET', 'pricing'],
  ['GET', 'pricing/lists'],
  ['POST', 'pricing/lists'],

  // Audit and leads
  ['GET', 'audit'],
  ['GET', 'audit/actions'],
  ['GET', 'leads'],
];

function segmentMatches(part: string, value: string): boolean {
  if (part === ':uuid') return UUID_SEGMENT.test(value);
  if (part === ':printer') return PRINTER_SEGMENT.test(value);
  return part === value;
}

/** Whether this method + path (segments after `admin`, already decoded) is a platform route. */
export function isPlatformRoute(method: string, segments: string[]): boolean {
  const verb = method.toUpperCase();

  return PLATFORM_ROUTES.some(([routeVerb, template]) => {
    if (routeVerb !== verb) return false;
    const parts = template.split('/');
    if (parts.length !== segments.length) return false;
    return parts.every((part, i) => segmentMatches(part, segments[i] ?? ''));
  });
}

/**
 * Turns the catch-all path into a backend URL, or null if it must not be sent.
 * Every segment is checked on its own, and the resolved URL is checked to still
 * sit under /admin/ on the configured API origin.
 */
export function resolvePlatformUrl(apiBase: string, segments: string[], search = ''): URL | null {
  if (segments.length < 1) return null;

  for (const seg of segments) {
    if (!isSafeSegment(seg)) return null;
  }

  const base = apiBase.replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(`${base}/admin/${segments.map(encodeURIComponent).join('/')}`);
  } catch {
    return null;
  }

  const allowed = new URL(`${base}/admin/`);
  if (url.origin !== allowed.origin || !url.pathname.startsWith(allowed.pathname)) {
    return null;
  }

  if (search) {
    if (!search.startsWith('?')) return null;
    url.search = search;
  }

  return url;
}

function isSafeSegment(seg: string): boolean {
  if (seg === '' || seg === '.' || seg === '..') return false;
  // eslint-disable-next-line no-control-regex
  return !/[\/\\%\u0000-\u001f\u007f]/.test(seg);
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[0-9:.+\-Z]{1,40})?$/;
const SMALL_INT = /^\d{1,4}$/;
const ENUM = (values: readonly string[]) => (v: string) => values.includes(v);
const PATTERN = (re: RegExp) => (v: string) => re.test(v);

const PERIODS = ['day', 'week', 'month', 'year'] as const;
const MODELS = ['integration', 'revenue-share', 'own-station', 'full-purchase', 'none'] as const;

/**
 * Every query parameter the console may send, and the test each value must pass.
 * `organizationId` is how a platform operator scopes a page to one partner; it
 * is valid here because the console is the platform, and the backend still
 * checks it.
 */
export const QUERY_RULES: Readonly<Record<string, (value: string) => boolean>> = {
  organizationId: PATTERN(UUID_SEGMENT),
  kioskId: PATTERN(UUID_SEGMENT),
  printerId: PATTERN(PRINTER_SEGMENT),
  period: ENUM(PERIODS),
  bucket: ENUM(PERIODS),
  from: PATTERN(ISO_DATE),
  to: PATTERN(ISO_DATE),
  status: PATTERN(/^[a-z_]{1,32}$/),
  limit: PATTERN(SMALL_INT),
  offset: PATTERN(SMALL_INT),
  search: (v) => v.length <= 255 && !/[\u0000-\u001f\u007f]/.test(v),
  businessModel: ENUM(MODELS),
  actorScope: ENUM(['platform', 'shop']),
  category: ENUM(['all', 'security']),
  action: PATTERN(/^[a-z_.]{1,64}$/),
  includeDeleted: ENUM(['true', 'false']),
};

export type QueryCheck = { ok: true; search: string } | { ok: false; reason: string };

/**
 * Checks a raw query string against QUERY_RULES. Returns the same string when
 * every parameter is allowed, or the reason it was refused. Duplicate keys are
 * refused too: a second `organizationId` is how a parameter-pollution attack
 * would try to make the backend and the console disagree about which partner
 * a request is for.
 */
export function checkQuery(search: string): QueryCheck {
  if (!search) return { ok: true, search: '' };
  if (!search.startsWith('?')) return { ok: false, reason: 'Malformed query' };

  const params = new URLSearchParams(search.slice(1));
  const seen = new Set<string>();

  for (const [key, value] of params.entries()) {
    if (seen.has(key)) return { ok: false, reason: `Repeated parameter: ${key}` };
    seen.add(key);

    const rule = QUERY_RULES[key];
    if (!rule) return { ok: false, reason: `Unsupported parameter: ${key}` };
    if (!rule(value)) return { ok: false, reason: `Invalid value for ${key}` };
  }

  return { ok: true, search: params.toString() ? `?${params.toString()}` : '' };
}

// ---------------------------------------------------------------------------
// Bodies and origins
// ---------------------------------------------------------------------------

/** Largest JSON body the console will forward. Every real form is far below this. */
export const MAX_BODY_BYTES = 64 * 1024;

/** A write must be JSON, and a body must be a single JSON object. */
export function checkJsonBody(
  contentType: string | null,
  raw: string | undefined
): { ok: true } | { ok: false; reason: string } {
  if (raw === undefined || raw === '') return { ok: true };
  if (!contentType || !contentType.toLowerCase().startsWith('application/json')) {
    return { ok: false, reason: 'Request body must be JSON' };
  }
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return { ok: false, reason: 'Request body too large' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'Request body must be a JSON object' };
    }
  } catch {
    return { ok: false, reason: 'Request body is not valid JSON' };
  }
  return { ok: true };
}

/**
 * CSRF guard: the browser's Origin (or, failing that, Referer) must name this
 * host. A request with neither is not from this console's own pages.
 */
export function isSameOriginRequest(headers: {
  origin?: string | null;
  referer?: string | null;
  host?: string | null;
}): boolean {
  const host = headers.host?.split(',')[0]?.trim().toLowerCase();
  if (!host) return false;

  const source = headers.origin || headers.referer;
  if (!source || source === 'null') return false;

  try {
    return new URL(source).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

/**
 * Modern browsers say where a request came from in `Sec-Fetch-Site`. A cross-site
 * request is refused outright: lax cookies would otherwise ride along on a
 * top-level navigation from another site, and every platform route is for this
 * console's own pages. Absent header (an older browser, or a non-browser client)
 * is not refused here: the origin check above still covers writes.
 */
export function isCrossSiteRequest(secFetchSite: string | null | undefined): boolean {
  return (secFetchSite ?? '').toLowerCase() === 'cross-site';
}

export function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

/**
 * The post-sign-in destination from `?next=`, or '/' when it is not a plain
 * same-origin path. Rejects absolute URLs, `//host`, backslash tricks and
 * control characters.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return '/';

  try {
    const base = 'http://same-origin.invalid';
    const url = new URL(next, base);
    if (url.origin !== base) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}

// ---------------------------------------------------------------------------
// Session signals
// ---------------------------------------------------------------------------

/**
 * What a refresh answer means. Only a refusal of the token itself ends the
 * session. Anything else (rate limited, overloaded, erroring) leaves the session
 * alone, because the refresh token was not spent by a request that never ran.
 */
export function classifyRefreshStatus(status: number): 'rejected' | 'unavailable' {
  return status === 400 || status === 401 || status === 403 ? 'rejected' : 'unavailable';
}

/** Set by the proxy on a 401 when the refresh itself failed: the session is over. */
export const SESSION_EXPIRED_HEADER = 'x-mprnt-session-expired';

/** Backend code while the account still has a temporary password. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';
export const PASSWORD_CHANGE_PATH = '/account?first=1';

/**
 * Single-flight per key with a short memory of the settled result. Used so that
 * several requests refreshing at once spend the rotated refresh token once.
 */
export function createSingleFlight<T>(ttlMs: number) {
  const entries = new Map<string, { promise: Promise<T>; expires: number }>();

  return function run(key: string, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    entries.forEach((e, k) => {
      if (e.expires <= now) entries.delete(k);
    });

    const hit = entries.get(key);
    if (hit) return hit.promise;

    const promise = fn();
    const entry = { promise, expires: Infinity };
    entries.set(key, entry);
    promise.then(
      () => {
        entry.expires = Date.now() + ttlMs;
      },
      () => {
        entries.delete(key);
      }
    );
    return promise;
  };
}
