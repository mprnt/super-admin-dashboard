import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { THEME_STORAGE_KEY } from '@/lib/theme';

// Every page is rendered per request. The Content-Security-Policy nonce is made
// for one response; a prerendered page would ship scripts the policy then blocks.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'MPRNT Platform',
  description: 'Platform operators only.',
  // Never indexed, never previewed by a link unfurler that would fetch it.
  robots: { index: false, follow: false, nocache: true, noarchive: true },
  applicationName: 'MPRNT Platform',
  appleWebApp: { capable: true, title: 'MPRNT Platform', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F5EF' },
    { media: '(prefers-color-scheme: dark)', color: '#0C1611' },
  ],
};

/**
 * Applies the operator's saved theme before the first paint, so a dark-mode user
 * never sees a white flash on every navigation. It only reads one preference
 * ('light' | 'dark' | 'system') and sets an attribute. It runs under this
 * response's nonce, so the policy still allows it and nothing else.
 */
const themeScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* suppressHydrationWarning: Next strips the nonce from the markup, so React sees it differ. The script runs before hydration and is never re-rendered. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-[100dvh] bg-bg text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:text-brand-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
