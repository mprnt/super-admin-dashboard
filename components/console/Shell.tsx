'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useConsole } from '../../lib/client/console';
import { parseProfile } from '../../lib/profile.ts';
import { buildTree } from '../../lib/tree.ts';
import { nextTheme } from '../../lib/theme.ts';
import type { SessionUser } from '../../lib/types';
import { ThemeSwitch, useTheme } from '../ui/theme';
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

/** The places a platform operator goes most, in the order they are used. */
const TABS: { href: string; label: string; icon: () => ReactNode; match: (p: string) => boolean }[] = [
  { href: '/', label: 'Home', icon: Icons.home, match: (p) => p === '/' },
  { href: '/partners', label: 'Partners', icon: Icons.partners, match: (p) => p.startsWith('/partners') },
  { href: '/printers', label: 'Printers', icon: Icons.printer, match: (p) => p.startsWith('/printers') },
  { href: '/attention', label: 'Attention', icon: Icons.alert, match: (p) => p.startsWith('/attention') },
];

const MORE_LINKS: { href: string; label: string; hint: string }[] = [
  { href: '/staff', label: 'Staff and platform accounts', hint: 'Every person with access' },
  { href: '/sessions', label: 'Sessions', hint: 'Every job, filterable and exportable' },
  { href: '/pricing', label: 'Pricing', hint: 'Rates in force and their history' },
  { href: '/reports', label: 'Partner comparison', hint: 'Every partner side by side' },
  { href: '/business-models', label: 'Business models', hint: 'Who is on which model' },
  { href: '/queue', label: 'Print queue', hint: 'Jobs routed in the last 24 hours' },
  { href: '/leads', label: 'Leads', hint: 'Enquiries from the website' },
  { href: '/audit', label: 'Audit trail', hint: 'Every administrative action' },
  { href: '/permissions', label: 'Permissions', hint: 'What each role may do' },
  { href: '/account', label: 'My account', hint: 'Change your password' },
];

export function ConsoleShell({ children }: { children: ReactNode }) {
  const data = useConsole();
  const { choice, setChoice } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  const [moreOpen, setMoreOpen] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [profile, setProfile] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setProfile(readProfile()), []);

  const sections = useMemo(
    () => buildTree({ organizations: data.organizations, kiosks: data.kiosks, printers: data.printers, users: data.users }),
    [data.organizations, data.kiosks, data.printers, data.users]
  );

  // Every sheet closes when the page changes.
  useEffect(() => {
    setMoreOpen(false);
    setExplorerOpen(false);
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
      <div className="bg-brand-soft px-4 py-1.5 text-center text-xs text-brand-text">
        <span className="font-semibold">Platform.</span> Changes apply to live partners and are recorded.
      </div>

      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="flex h-16 items-center gap-2 px-4 md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-full pr-2 text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-brand text-brand-ink">
              <Icons.printer />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-tight tracking-tight">MPrnt</span>
              <span className="block truncate text-xs leading-tight text-mute">Platform console</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <IconButton label="Find a partner, printer or person" onClick={() => setPaletteOpen(true)}>
              <Icons.search />
            </IconButton>
            <IconButton label={`Theme: ${choice}. Tap to change`} onClick={() => setChoice(nextTheme(choice))} className="hidden sm:grid">
              <Icons.theme />
            </IconButton>
            <IconButton label="Reload all data" onClick={() => data.reload()} className="hidden lg:grid">
              <Icons.refresh />
            </IconButton>
            <span aria-hidden title={profile?.email} className="ml-1 hidden h-10 w-10 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-text md:grid">
              {initial}
            </span>
            <Button size="sm" variant="default" onClick={() => void onSignOut()} disabled={signingOut} className="hidden lg:inline-flex">
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Button>
            <IconButton label="More" onClick={() => setMoreOpen(true)} className="lg:hidden">
              <Icons.more />
            </IconButton>
          </div>
        </div>
      </header>

      <div className="lg:flex">
        {/* Desktop: the navigator stays put in a sidebar. On a phone it is a sheet. */}
        <aside
          aria-label="Navigator"
          className="sticky top-[92px] hidden h-[calc(100dvh-92px)] w-[300px] shrink-0 border-r border-line bg-surface lg:block"
        >
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
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className="flex min-h-[64px] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-mute"
            >
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
          <div className="grid grid-cols-2 gap-2 lg:hidden">
            <Button onClick={() => { setMoreOpen(false); setExplorerOpen(true); }} className="w-full">
              Explorer
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

      <Modal open={explorerOpen} onClose={() => setExplorerOpen(false)} title="Explorer" full focusField={false}>
        <div className="-mx-5 -mb-6 flex h-[calc(92dvh-120px)] min-h-[360px] flex-col">
          <TreeNav sections={sections} pathname={pathname} onNavigate={() => setExplorerOpen(false)} />
        </div>
      </Modal>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} sections={sections} onPick={(href) => router.push(href)} />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        'grid h-11 w-11 place-items-center rounded-full text-ink transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-text',
        className
      )}
    >
      {children}
    </button>
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
