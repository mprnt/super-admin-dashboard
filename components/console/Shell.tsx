'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useConsole } from '../../lib/client/console';
import { parseProfile } from '../../lib/profile.ts';
import { buildSearchIndex, buildTree } from '../../lib/tree.ts';
import type { SessionUser } from '../../lib/types';
import { ThemeSwitch } from '../ui/theme';
import { Button, ErrorState, cx } from '../ui/primitives';
import { Modal } from '../ui/dialogs';
import { Icons } from '../ui/icons';
import { TreeNav } from './TreeNav';
import { Palette } from './Palette';

/** Sign out after this long without input. The backend session is revoked with it. */
const IDLE_MINUTES = 20;

function readProfile(): SessionUser | null {
  if (typeof document === 'undefined') return null;
  const pair = document.cookie.split('; ').find((c) => c.startsWith('mprnt_sa_profile='));
  return parseProfile(pair ? pair.slice('mprnt_sa_profile='.length) : null);
}

/** The bottom tab bar on a phone: the four places used most, and More. */
const TABS: { href: string; label: string; icon: () => ReactNode; match: (p: string) => boolean }[] = [
  { href: '/', label: 'Home', icon: Icons.home, match: (p) => p === '/' },
  { href: '/partners', label: 'Partners', icon: Icons.partners, match: (p) => p.startsWith('/partners') },
  { href: '/printers', label: 'Printers', icon: Icons.printer, match: (p) => p.startsWith('/printers') },
  { href: '/attention', label: 'Attention', icon: Icons.alert, match: (p) => p.startsWith('/attention') },
];

/** Everything that is not a partner and not in the tab bar. */
const MORE_LINKS: { href: string; label: string; hint: string }[] = [
  { href: '/staff', label: 'Staff and platform accounts', hint: 'Every person with access' },
  { href: '/sessions', label: 'Sessions', hint: 'Every job, filterable and exportable' },
  { href: '/pricing', label: 'Pricing', hint: 'Rates in force and their history' },
  { href: '/reports', label: 'Partner comparison', hint: 'Every partner side by side' },
  { href: '/business-models', label: 'Business models', hint: 'Who is on which model' },
  { href: '/billing', label: 'Billing', hint: 'Hardware sales, subscriptions and prices' },
  { href: '/queue', label: 'Print queue', hint: 'Jobs routed in the last 24 hours' },
  { href: '/leads', label: 'Leads', hint: 'Enquiries from the website' },
  { href: '/audit', label: 'Audit trail', hint: 'Every administrative action' },
  { href: '/permissions', label: 'Permissions', hint: 'What each role may do' },
  { href: '/account', label: 'My account', hint: 'Change your password' },
];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const data = useConsole();
  const pathname = usePathname();
  const router = useRouter();

  const [moreOpen, setMoreOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profile, setProfile] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setProfile(readProfile()), []);

  const { organizations, kiosks, printers, users } = data;
  const sections = useMemo(() => buildTree({ organizations, kiosks, printers, users }), [organizations, kiosks, printers, users]);
  const index = useMemo(() => buildSearchIndex({ organizations, kiosks, printers, users }), [organizations, kiosks, printers, users]);

  // Every sheet and menu closes when the page changes.
  useEffect(() => {
    setMoreOpen(false);
    setExplorerOpen(false);
    setMenuOpen(false);
  }, [pathname]);

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

  const initial = (profile?.email ?? '?').charAt(0).toUpperCase();

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4 md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-2xl pr-2 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand text-brand-ink">
              <Icons.printer />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight">MPrnt</span>
              <span className="block truncate text-xs text-mute">Platform console</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            {/* Wide search on a desk; an icon on a phone. Both open the same ⌘K finder. */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Find a partner, printer or person"
              className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm text-mute transition hover:border-mute lg:w-[340px] lg:px-4"
            >
              <Icons.search />
              <span className="hidden min-w-0 flex-1 truncate text-left lg:block">Find a partner, printer or person</span>
              <kbd className="hidden shrink-0 rounded-md border border-line px-1.5 font-mono text-[11px] lg:block">⌘K</kbd>
            </button>

            <span className="hidden items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand-text xl:inline-flex">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-text" />
              Live · every change is recorded
            </span>

            <div className="hidden lg:block">
              <ThemeSwitch />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Account for ${profile?.email ?? 'this operator'}`}
                className="grid h-11 w-11 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-text transition hover:brightness-95"
              >
                {initial}
              </button>
              {menuOpen && (
                <>
                  <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setMenuOpen(false)} />
                  <div role="menu" className="absolute right-0 z-50 mt-2 w-[min(88vw,300px)] overflow-hidden rounded-3xl border border-line bg-surface shadow-sheet">
                    <div className="border-b border-line px-4 py-3">
                      <p className="truncate text-sm font-medium text-ink">{profile?.email ?? 'Signed in'}</p>
                      <p className="text-xs capitalize text-mute">{profile?.role?.replace('_', ' ') ?? 'Platform'}</p>
                    </div>
                    <div className="p-2">
                      <Link role="menuitem" href="/account" className="flex min-h-[44px] items-center rounded-2xl px-3 text-sm text-ink hover:bg-raised">
                        My account and password
                      </Link>
                      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); void data.reload(); }} className="flex min-h-[44px] w-full items-center rounded-2xl px-3 text-left text-sm text-ink hover:bg-raised">
                        Reload all data
                      </button>
                      <button type="button" role="menuitem" onClick={() => void onSignOut()} disabled={signingOut} className="flex min-h-[44px] w-full items-center rounded-2xl px-3 text-left text-sm font-medium text-bad hover:bg-bad/10 disabled:opacity-50">
                        {signingOut ? 'Signing out…' : 'Sign out'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="lg:flex">
        {/* Desktop: the navigator is a sidebar beside the page. On a phone it is a sheet. */}
        <aside aria-label="Navigator" className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-72 shrink-0 border-r border-line bg-surface lg:block">
          <TreeNav sections={sections} pathname={pathname} />
        </aside>

        <main id="main" className="min-w-0 flex-1 px-4 pb-32 pt-6 md:px-8 lg:pb-16">
          {data.error && (
            <div className="mb-5">
              <ErrorState error={`Could not load the platform data: ${data.error}`} onRetry={data.reload} />
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Phone: the four places used most, with More for everything else. */}
      <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx('flex min-h-[64px] flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-brand-text' : 'text-mute')}
                >
                  <span className={cx('grid h-8 w-14 place-items-center rounded-full transition', active && 'bg-brand-soft')}>
                    <Icon />
                  </span>
                  {tab.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className="flex min-h-[64px] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-mute">
              <span className="grid h-8 w-14 place-items-center rounded-full">
                <Icons.more />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More" focusField={false}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => { setMoreOpen(false); setExplorerOpen(true); }} className="w-full">
              Navigator
            </Button>
            <Button onClick={() => { setMoreOpen(false); setPaletteOpen(true); }} className="w-full">
              Find
            </Button>
          </div>

          <div>
            <h3 className="mb-2 px-1 text-xs font-medium text-mute">Across every partner</h3>
            <ul className="overflow-hidden rounded-3xl bg-raised/70">
              {MORE_LINKS.map((link, i) => (
                <li key={link.href} className={cx(i > 0 && 'border-t border-line')}>
                  <Link href={link.href} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 hover:bg-raised">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-ink">{link.label}</span>
                      <span className="block truncate text-xs text-mute">{link.hint}</span>
                    </span>
                    <span className="text-mute">
                      <Icons.chevron />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 px-1 text-xs font-medium text-mute">Appearance</h3>
            <ThemeSwitch className="w-full [&>*]:flex-1" />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button onClick={() => { setMoreOpen(false); void data.reload(); }} className="w-full">
              Reload data
            </Button>
            <Button variant="danger" onClick={() => void onSignOut()} disabled={signingOut} className="w-full">
              <Icons.logout />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
          {profile && <p className="text-center text-xs text-mute">Signed in as {profile.email}</p>}
        </div>
      </Modal>

      <Modal open={explorerOpen} onClose={() => setExplorerOpen(false)} title="Navigator" full focusField={false}>
        <div className="-mx-5 -mb-8 flex h-[calc(92dvh-120px)] min-h-[360px] flex-col">
          <TreeNav sections={sections} pathname={pathname} onNavigate={() => setExplorerOpen(false)} />
        </div>
      </Modal>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} index={index} onPick={(href) => router.push(href)} />
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
