import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/lib/server/config';
import { clearSessionCookies, getRefreshToken, relayHeaders } from '@/lib/server/session';
import { isSameOriginRequest } from '@/lib/gate';

export const dynamic = 'force-dynamic';

/**
 * Ends the session. The refresh token is revoked at the backend as well as
 * cleared from the browser, so a copied cookie stops working at once.
 */
export async function POST(req: NextRequest) {
  if (
    !isSameOriginRequest({
      origin: req.headers.get('origin'),
      referer: req.headers.get('referer'),
      host: req.headers.get('x-forwarded-host') || req.headers.get('host'),
    })
  ) {
    return NextResponse.json({ message: 'Cross-origin request refused' }, { status: 403 });
  }

  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    await fetch(`${API_BASE}/admin/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...relayHeaders(req) },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }

  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}
