'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useConsole } from '../../lib/client/console';
import { parseProfile } from '../../lib/profile.ts';
import { buildTree } from '../../lib/tree.ts';
import type { SessionUser } from '../../lib/types';
import { Button, ErrorState, cx } from '../ui/primitives';
import { TreeNav } from './TreeNav';
import { Palette } from './Palette';

/** Sign out after this long without input. The backend session is revoked with it. */
const IDLE_MINUTES = 20;

function readProfile(): SessionUser | null {
  if (typeof document === 'undefined') return null;
  const pair = document.cookie.split('; ').find((c) => c.startsWith('mprnt_sa_profile='));
  return parseProfile(pair ? pair.slice('mprnt_sa_profile='.length) : null);
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const data = useConsole();
  const pathname = usePathname();
  const router = useRouter();

  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [profile, setProfile] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setProfile(readProfile()), []);

  const sections = useMemo(
    () =>
      buildTree({
        organizations: data.organizations,
        kiosks: data.kiosks,
        printers: data.printers,
        users: data.users,
      }),
    [data.organizations, data.kiosks, data.printers, data.users]
  );

  // Close the mobile navigation whenever the page changes.
  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const signOut = async (reason?: string) => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } finally {
      window.location.assign(reason ? `/login?notice=${reason}` : '/login');
    }
  };

  useIdleSignOut(() => void signOut('idle'));

  const onSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div role="note" className="border-b border-amber/40 bg-amber/10 px-4 py-1.5 text-center text-[12px] text-amber">
        <span className="font-semibold">Platform scope.</span>{' '}
        <span className="text-amber/90">Every change here applies to live partners and is written to the audit log.</span>
      </div>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/95 px-3 py-2 backdrop-blur">
        <button
          type="button"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-controls="console-nav"
          className="rounded border border-line px-2.5 py-1.5 text-sm text-ink lg:hidden"
        >
          Tree
        </button>

        <a href="/" className="flex items-center gap-2 pr-2 text-sm font-semibold tracking-tight text-ink">
          <span aria-hidden className="grid h-6 w-6 place-items-center rounded bg-amber font-mono text-[11px] text-[#111]">
            M
          </span>
          <span className="hidden sm:inline">MPrnt</span>
          <span className="rounded border border-amber/50 px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-amber">Platform</span>
        </a>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="ml-auto flex min-w-0 flex-1 items-center gap-2 rounded border border-line bg-surface px-3 py-1.5 text-left text-sm text-mute hover:border-mute sm:max-w-md sm:flex-none sm:w-80"
        >
          <span className="truncate">Find a partner, printer or person</span>
          <kbd className="ml-auto hidden shrink-0 rounded border border-line px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
        </button>

        <div className="hidden min-w-0 text-right md:block">
          <div className="truncate text-xs text-ink">{profile?.email ?? 'Signed in'}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-mute">{profile?.role?.replace('_', ' ') ?? 'platform'}</div>
        </div>

        <Button size="sm" onClick={() => data.reload()} aria-label="Reload all data" className="hidden sm:inline-flex">
          Reload
        </Button>
        <Button size="sm" onClick={() => void onSignOut()} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desktop: a fixed tree. Below lg it slides in over the page. */}
        {/* The open and closed states are separate class sets: `hidden` and `block` on one
            element fight each other in the stylesheet, and `hidden` wins. */}
        <aside
          id="console-nav"
          className={cx(
            'border-r border-line bg-surface',
            navOpen
              ? 'fixed inset-y-0 left-0 z-40 flex w-[85vw] max-w-[320px] flex-col shadow-2xl'
              : 'hidden lg:sticky lg:top-[53px] lg:block lg:h-[calc(100vh-53px)] lg:w-[300px] lg:shrink-0'
          )}
        >
          {navOpen && (
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <span className="text-sm font-semibold text-ink">Navigator</span>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="rounded border border-line px-2.5 py-1 text-xs text-mute hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
              >
                Close
              </button>
            </div>
          )}
          <div className="h-full min-h-0 flex-1">
            <TreeNav sections={sections} pathname={pathname} onNavigate={() => setNavOpen(false)} />
          </div>
        </aside>
        {navOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setNavOpen(false)} />}

        <main id="main" className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          {data.error && (
            <div className="mb-4">
              <ErrorState error={`Could not load the platform data: ${data.error}`} onRetry={data.reload} />
            </div>
          )}
          {children}
        </main>
      </div>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} sections={sections} onPick={(href) => router.push(href)} />
    </div>
  );
}

/** Signs the operator out after a period with no input, on any page. */
function useIdleSignOut(onIdle: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handler = useRef(onIdle);
  handler.current = onIdle;

  useEffect(() => {
    const limit = IDLE_MINUTES * 60 * 1000;
    const arm = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => handler.current(), limit);
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      events.forEach((e) => window.removeEventListener(e, arm));
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
}
