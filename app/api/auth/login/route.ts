import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/server/config';
import { relayHeaders, setSessionCookies } from '@/lib/server/session';
import { isSameOriginRequest } from '@/lib/gate';
import type { SessionUser } from '@/lib/types';

export const dynamic = 'force-dynamic';

function sameOrigin(req: Request): boolean {
  return isSameOriginRequest({
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
    host: req.headers.get('x-forwarded-host') || req.headers.get('host'),
  });
}

interface BackendLogin {
  status?: string;
  message?: string;
  data?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    mustChangePassword: boolean;
    user: {
      id: string;
      email: string;
      role: SessionUser['role'];
      organizationId: string | null;
    };
  };
}

/**
 * Signs a platform operator in. Only `super_admin` accounts get a console session.
 *
 * A shop account can be refused here even with the right password. The
 * backend has already issued a session for it at that point, so it is revoked
 * before the refusal goes back: a refused sign-in leaves no live token behind.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ message: 'Cross-origin request refused' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ message: 'Enter your email and password' }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...relayHeaders(req) },
      body: JSON.stringify({ email: body.email, password: body.password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    console.error(`[auth] Cannot reach the backend at ${API_BASE}`);
    return NextResponse.json(
      { message: 'Cannot reach the MPRNT backend. Check that it is running and that MPRNT_API_URL points at it.' },
      { status: 503 }
    );
  }

  const data = (await upstream.json().catch(() => ({}))) as BackendLogin;

  if (!upstream.ok || !data.data) {
    // Pass the backend's status through: 401 bad credentials, 423 locked, 429 rate limited.
    return NextResponse.json(
      { message: data.message || 'Unable to sign in' },
      { status: upstream.status || 500 }
    );
  }

  const user = data.data.user;

  if (user.role !== 'super_admin') {
    await fetch(`${API_BASE}/admin/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...relayHeaders(req) },
      body: JSON.stringify({ refreshToken: data.data.refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);

    return NextResponse.json(
      { message: 'This account does not have platform access.', code: 'NOT_PLATFORM_ACCOUNT' },
      { status: 403 }
    );
  }

  const profile: SessionUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: data.data.mustChangePassword,
  };

  const res = NextResponse.json({ ok: true, mustChangePassword: profile.mustChangePassword });
  setSessionCookies(
    res,
    {
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
      expiresIn: data.data.expiresIn,
    },
    profile
  );
  return res;
}
