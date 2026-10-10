import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  IS_PRODUCTION,
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  SESSION_COOKIE_SECONDS,
} from './config';
import type { SessionUser } from '../types';
import { parseProfile } from '../profile';

/**
 * Token handling. Both tokens live in httpOnly cookies and are attached on the
 * server, so no page script can read a credential. The profile cookie is the
 * one readable value: it holds only display facts (who is signed in and whether
 * a password change is due). It is never trusted for a decision. The backend
 * answers every request from the token.
 */

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const base = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  // Lax still sends the cookie on a top-level navigation, so a bookmarked page
  // works, while cross-site form posts and subresource requests do not carry it.
  sameSite: 'lax' as const,
  path: '/',
};

export function setSessionCookies(res: NextResponse, tokens: Tokens, profile: SessionUser): void {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: tokens.expiresIn });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...base, maxAge: SESSION_COOKIE_SECONDS });
  // Deliberately not httpOnly: the sidebar needs the operator's email and role to
  // render. It carries no secret, and a forged value grants nothing.
  res.cookies.set(PROFILE_COOKIE, JSON.stringify(profile), {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_COOKIE_SECONDS,
  });
}

export function clearSessionCookies(res: NextResponse): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, PROFILE_COOKIE]) {
    res.cookies.set(name, '', { ...base, httpOnly: name !== PROFILE_COOKIE, maxAge: 0 });
  }
}

export function getAccessToken(): string | undefined {
  return cookies().get(ACCESS_COOKIE)?.value;
}

export function getRefreshToken(): string | undefined {
  return cookies().get(REFRESH_COOKIE)?.value;
}

export function getProfile(): SessionUser | null {
  return parseProfile(cookies().get(PROFILE_COOKIE)?.value);
}

/** Headers that tell the backend the real operator IP, behind this server. */
export function relayHeaders(req: Request): Record<string, string> {
  const secret = process.env.MPRNT_PROXY_SECRET;
  if (!secret) return {};

  const ip =
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '';

  return {
    'X-MPrnt-Proxy-Secret': secret,
    ...(ip ? { 'X-MPrnt-Client-IP': ip } : {}),
  };
}
