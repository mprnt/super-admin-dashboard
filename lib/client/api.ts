'use client';

/**
 * The browser's only route to the platform API: /api/proxy/*, on this origin.
 * It carries no credential. The httpOnly cookies go with it automatically, and
 * the proxy attaches the token on the server.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type Scalar = string | number | boolean | null | undefined;

/** A query string from the defined parameters only. Empty values are left out. */
export function qs(params: Record<string, Scalar>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    sp.set(key, String(value));
  }
  const out = sp.toString();
  return out ? `?${out}` : '';
}

/** Path segment safe for an id. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

export async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const hasBody = body !== undefined;

  const res = await fetch(`/api/proxy/${path}`, {
    method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    message?: string;
    code?: string;
  };

  if (!res.ok) {
    if (res.status === 401 && res.headers.get('x-mprnt-session-expired') === '1') {
      window.location.assign('/login?notice=expired');
      throw new ApiError('Your session has ended', 401);
    }
    if (
      res.status === 403 &&
      json.code === 'PASSWORD_CHANGE_REQUIRED' &&
      !window.location.pathname.startsWith('/account')
    ) {
      window.location.assign('/account?first=1');
    }
    throw new ApiError(json.message || `Request failed (${res.status})`, res.status, json.code);
  }

  return (json.data ?? json) as T;
}

/** Downloads a non-JSON response (a CSV export) through the proxy. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`/api/proxy/${path}`, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(json.message || `Download failed (${res.status})`, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
