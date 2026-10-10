import 'server-only';

/**
 * Server-side configuration. Nothing in this file reaches the browser.
 */

function resolveApiBase(): string {
  const raw = (process.env.MPRNT_API_URL || 'http://localhost:3000/api/v1').replace(/\/+$/, '');

  // A plain-http remote host is almost always a typo, and it fails in a way that
  // is hard to read: the host redirects to https, fetch turns the POST into a GET
  // and drops the body. Upgrade it, as the shop dashboard does.
  if (raw.startsWith('http://')) {
    const host = raw.slice('http://'.length).split('/')[0]?.split(':')[0] ?? '';
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!isLocal) {
      console.warn(`[config] MPRNT_API_URL is http:// for a remote host; upgrading to https:// - ${host}`);
      return 'https://' + raw.slice('http://'.length);
    }
  }

  return raw;
}

export const API_BASE = resolveApiBase();

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Cookie names are specific to this console. Cookies are scoped by host, not
 * by port, so on localhost the shop dashboard and this console would otherwise
 * read each other's sessions.
 */
export const ACCESS_COOKIE = 'mprnt_sa_at';
export const REFRESH_COOKIE = 'mprnt_sa_rt';
export const PROFILE_COOKIE = 'mprnt_sa_profile';

/**
 * A platform session lasts at most this long in the browser, however long the
 * backend would keep the refresh token alive. Sign-in is needed again after it.
 */
export const SESSION_COOKIE_SECONDS = 12 * 60 * 60;
