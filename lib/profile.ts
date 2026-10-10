import type { SessionUser } from './types.ts';

/**
 * Parses the display-only profile cookie. Pure, so middleware (Edge runtime)
 * and the server routes share one parser.
 *
 * The cookie is client-editable. Nothing decides access from it: the backend
 * answers every request from the token. This parser exists to draw the right
 * navigation and to tidy stale sessions, nothing more.
 */
export function parseProfile(raw: string | undefined | null): SessionUser | null {
  if (!raw) return null;

  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // Already plain text; use it as is.
  }

  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object') return null;
    const v = value as Record<string, unknown>;
    if (typeof v.id !== 'string' || typeof v.email !== 'string' || typeof v.role !== 'string') {
      return null;
    }
    return {
      id: v.id,
      email: v.email,
      role: v.role as SessionUser['role'],
      mustChangePassword: v.mustChangePassword === true,
    };
  } catch {
    return null;
  }
}
