import { NextRequest, NextResponse } from 'next/server';
import { buildCsp, makeNonce } from '@/lib/csp';
import { parseProfile } from '@/lib/profile';
import { PASSWORD_CHANGE_PATH, safeNextPath } from '@/lib/gate';

const ACCESS = 'mprnt_sa_at';
const REFRESH = 'mprnt_sa_rt';
const PROFILE = 'mprnt_sa_profile';

/**
 * Page gate and CSP for the platform console.
 *
 * This is a redirect and a header, not the security boundary. The backend
 * checks every request. What this does is:
 *
 *  - give every page a fresh nonce and the strict CSP (lib/csp.ts), so injected
 *    markup cannot run;
 *  - send anyone without a platform session to sign in, and drop a session whose
 *    profile is not a platform account;
 *  - hold an account on its temporary password to the account page.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // The API routes answer their own requests and carry no page security headers.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const nonce = makeNonce();
  const isDev = process.env.NODE_ENV !== 'production';
  const csp = buildCsp(nonce, isDev);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const isLogin = pathname === '/login' || pathname.startsWith('/login/');
  const hasSession = Boolean(req.cookies.get(REFRESH)?.value);
  const profile = parseProfile(req.cookies.get(PROFILE)?.value);
  const isPlatform = profile?.role === 'super_admin';

  const next = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp);
    return res;
  };

  const redirect = (path: string, clear = false) => {
    const url = req.nextUrl.clone();
    url.pathname = path.split('?')[0] ?? '/';
    url.search = path.includes('?') ? `?${path.split('?')[1]}` : '';
    const res = NextResponse.redirect(url);
    if (clear) {
      for (const name of [ACCESS, REFRESH, PROFILE]) {
        res.cookies.set(name, '', { path: '/', maxAge: 0 });
      }
    }
    return next(res);
  };

  if (isLogin) {
    // A signed-in platform operator has no reason to see the sign-in form.
    if (hasSession && isPlatform) return redirect('/');
    return next(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (!hasSession) {
    const target = pathname !== '/' ? `/login?next=${encodeURIComponent(safeNextPath(pathname + search))}` : '/login';
    return redirect(target);
  }

  // A session with no platform profile is not ours to use. Sign it out here.
  if (!isPlatform) {
    return redirect('/login?notice=platform', true);
  }

  if (profile.mustChangePassword && !pathname.startsWith('/account')) {
    return redirect(PASSWORD_CHANGE_PATH);
  }

  return next(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
