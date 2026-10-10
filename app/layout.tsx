import type { Metadata, Viewport } from 'next';
import './globals.css';

// Every page is rendered per request. The Content-Security-Policy nonce is made
// for one response; a prerendered page would ship scripts the policy then blocks.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'MPrnt Platform Console',
  description: 'Platform operators only.',
  // Never indexed, never previewed by a link unfurler that would fetch it.
  robots: { index: false, follow: false, nocache: true, noarchive: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#070a0f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded focus:bg-amber focus:px-3 focus:py-2 focus:text-sm focus:text-[#111]"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
