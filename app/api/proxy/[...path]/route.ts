import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/server/config';
import {
  clearSessionCookies,
  getAccessToken,
  getProfile,
  getRefreshToken,
  relayHeaders,
  setSessionCookies,
  type Tokens,
} from '@/lib/server/session';
import {
  MAX_BODY_BYTES,
  MAX_UPLOAD_BYTES,
  checkMultipartBody,
  isUploadRoute,
  classifyRefreshStatus,
  SESSION_EXPIRED_HEADER,
  checkJsonBody,
  checkQuery,
  createSingleFlight,
  isCrossSiteRequest,
  isPlatformRoute,
  isSameOriginRequest,
  isUnsafeMethod,
  resolvePlatformUrl,
} from '@/lib/gate';
import type { SessionUser } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Backend-for-frontend proxy for the platform console. Every API call from the
 * browser goes through here, in this order:
 *
 *  1. the route must be on the platform allowlist (lib/gate.ts) - otherwise a
 *     plain 404, the same as an unknown path;
 *  2. the query string must contain only known parameters, each well formed;
 *  3. a state-changing request must come from this host;
 *  4. a body must be a single JSON object, and not too large;
 *  5. the access token is attached here, and refreshed once on a 401.
 *
 * The backend still checks everything: this site cannot grant itself access.
 */

/**
 * The outcome of trying to refresh the session. Only `rejected` means the
 * session is over. `unavailable` (the backend was busy, rate-limited or
 * unreachable) leaves the cookies alone, because the refresh token was never
 * spent and the operator should not be signed out for a moment of backend load.
 */
type Refresh = { kind: 'ok'; tokens: Tokens } | { kind: 'rejected' } | { kind: 'unavailable' };

// Rotating refresh tokens: several requests can 401 together and each would
// spend the same refresh token. One refresh runs at a time, and its result is
// reused briefly by requests still carrying the old cookie.
const refreshOnce = createSingleFlight<Refresh>(30_000);

async function callRefresh(req: NextRequest, refreshToken: string): Promise<Refresh> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/admin/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...relayHeaders(req) },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { kind: 'unavailable' };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { data?: Tokens };
    return body.data ? { kind: 'ok', tokens: body.data } : { kind: 'unavailable' };
  }
  // The backend answered and refused this refresh token: the session is over.
  return classifyRefreshStatus(res.status) === 'rejected' ? { kind: 'rejected' } : { kind: 'unavailable' };
}

function refuse(status: number, message: string) {
  return NextResponse.json({ message }, { status });
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const method = req.method.toUpperCase();
  const { path: segments } = await ctx.params;

  if (!isPlatformRoute(method, segments)) {
    return refuse(404, 'Not found');
  }

  if (isCrossSiteRequest(req.headers.get('sec-fetch-site'))) {
    return refuse(403, 'Cross-site request refused');
  }

  const query = checkQuery(req.nextUrl.search || '');
  if (!query.ok) {
    return refuse(400, query.reason);
  }

  const target = resolvePlatformUrl(API_BASE, segments, query.search);
  if (!target) {
    return refuse(404, 'Not found');
  }

  if (
    isUnsafeMethod(method) &&
    !isSameOriginRequest({
      origin: req.headers.get('origin'),
      referer: req.headers.get('referer'),
      host: req.headers.get('x-forwarded-host') || req.headers.get('host'),
    })
  ) {
    return refuse(403, 'Cross-origin request refused');
  }

  // A file upload is the one route that may send a multipart form, and only up
  // to MAX_UPLOAD_BYTES. Everything else is JSON, capped at MAX_BODY_BYTES.
  let rawBody: string | ArrayBuffer | undefined;
  let bodyType = 'application/json';
  if (!['GET', 'HEAD'].includes(method)) {
    const declared = Number(req.headers.get('content-length') || '0');
    if (isUploadRoute(method, segments)) {
      if (declared > MAX_UPLOAD_BYTES) return refuse(413, 'The file is too large');
      const contentType = req.headers.get('content-type');
      const formCheck = checkMultipartBody(contentType);
      if (!formCheck.ok) return refuse(400, formCheck.reason);

      rawBody = await req.arrayBuffer();
      if (rawBody.byteLength > MAX_UPLOAD_BYTES) return refuse(413, 'The file is too large');
      bodyType = contentType as string;
    } else {
      if (declared > MAX_BODY_BYTES) return refuse(413, 'Request body too large');

      const text = await req.text();
      const checked = checkJsonBody(req.headers.get('content-type'), text);
      if (!checked.ok) return refuse(400, checked.reason);
      rawBody = text;
    }
  }

  const call = (token?: string) =>
    fetch(target.toString(), {
      method,
      headers: {
        'Content-Type': bodyType,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...relayHeaders(req),
      },
      body: rawBody || undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });

  let upstream: Response;
  try {
    upstream = await call(await getAccessToken());
  } catch {
    console.error(`[proxy] Cannot reach the backend at ${API_BASE}`);
    return refuse(503, 'Cannot reach the MPRNT backend. Is it running?');
  }

  let refreshed: Tokens | null = null;
  let profile: SessionUser | null = null;

  if (upstream.status === 401) {
    const refreshToken = await getRefreshToken();
    profile = await getProfile();

    let outcome: Refresh = { kind: 'rejected' };
    if (refreshToken && profile) {
      outcome = await refreshOnce(refreshToken, () => callRefresh(req, refreshToken)).catch(
        (): Refresh => ({ kind: 'unavailable' })
      );
    }

    if (outcome.kind === 'unavailable') {
      // The session may well be fine: keep the cookies and ask the operator to retry.
      return refuse(503, 'The MPRNT backend is busy. Try again in a moment.');
    }

    if (outcome.kind === 'rejected' || !profile) {
      const res = NextResponse.json(
        { message: 'Session expired' },
        { status: 401, headers: { [SESSION_EXPIRED_HEADER]: '1' } }
      );
      clearSessionCookies(res);
      return res;
    }

    refreshed = outcome.tokens;

    try {
      upstream = await call(refreshed.accessToken);
    } catch {
      // The refresh already spent the old refresh token: the new pair must still
      // reach the browser, even though this replay failed.
      const res = refuse(503, 'Cannot reach the MPRNT backend. Is it running?');
      setSessionCookies(res, refreshed, profile);
      return res;
    }
  }

  const contentType = upstream.headers.get('content-type') || '';

  // CSV exports and other non-JSON responses pass through unchanged.
  if (!contentType.includes('application/json')) {
    const bytes = await upstream.arrayBuffer();
    const headers: Record<string, string> = {
      'content-type': contentType || 'application/octet-stream',
    };
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) headers['content-disposition'] = disposition;

    // A document is for the person who asked for it, and only for them. Nothing may
    // cache it, and the browser may not guess a type for it.
    headers['cache-control'] = 'no-store';
    headers['x-content-type-options'] = 'nosniff';

    const res = new NextResponse(bytes, { status: upstream.status, headers });
    if (refreshed && profile) setSessionCookies(res, refreshed, profile);
    return res;
  }

  const data = await upstream.json().catch(() => ({}));
  const res = NextResponse.json(data, { status: upstream.status });
  if (refreshed && profile) setSessionCookies(res, refreshed, profile);
  return res;
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
