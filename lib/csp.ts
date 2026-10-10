/**
 * Content-Security-Policy for every page the console serves.
 *
 * Scripts are allowed only when they carry this response's nonce, or come
 * from a script that was itself nonced (`strict-dynamic`). Injected markup
 * therefore cannot run, even if it lands in the page. There are no third-party
 * origins at all: no CDN scripts, fonts or analytics.
 *
 * Styles allow 'unsafe-inline' because Next and the React runtime set style
 * attributes; a style cannot execute code, so the exposure is small.
 */

export function buildCsp(nonce: string, isDev: boolean): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Next's development runtime evaluates code for hot reload. Production
    // builds never need it.
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(' ');

  // Hot reload uses a websocket in development only.
  const connectSrc = ["'self'", ...(isDev ? ['ws:', 'wss:'] : [])].join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * A fresh, unguessable nonce. Built from Web Crypto so it runs in the Edge
 * runtime that middleware uses as well as on Node.
 */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
