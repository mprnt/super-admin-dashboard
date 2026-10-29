'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useConsole, useResource } from '../../lib/client/console';
import { parseProfile } from '../../lib/profile.ts';
import { partnerReadiness, type Readiness } from '../../lib/readiness.ts';
import { buildSearchIndex, nodeMatches, partnerTone, type TreeNode } from '../../lib/tree.ts';
import type { SessionUser } from '../../lib/types';
import { ThemeSwitch } from '../ui/theme';
import { ErrorState, StatusDot, cx } from '../ui/primitives';
import { Icons, type IconName } from '../ui/icons';
import { RailBadge, ReadinessMeter } from '../ui/insight';
import { MprntLogo } from '../MprntLogo';
import { Palette } from './Palette';

/** Sign out after this long without input. The backend session is revoked with it. */
const IDLE_MINUTES = 20;

function readProfile(): SessionUser | null {
  if (typeof document === 'undefined') return null;
  const pair = document.cookie.split('; ').find((c) => c.startsWith('mprnt_sa_profile='));
  return parseProfile(pair ? pair.slice('mprnt_sa_profile='.length) : null);
}

type BadgeKey = 'partners' | 'drafts' | 'attention' | 'printersDown';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: BadgeKey;
  /** Whether the item is the current page. Defaults to the path or anything under it. */
  match?: (pathname: string) => boolean;
}

/** Every page that is not one partner's, grouped by what an operator is doing. */
const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Platform',
    items: [
      { href: '/', label: 'Overview', icon: 'home', match: (p) => p === '/' },
      { href: '/partners', label: 'Partners', icon: 'partners', badge: 'partners', match: (p) => p === '/partners' },
      { href: '/partners/new', label: 'Onboard a partner', icon: 'onboarding', badge: 'drafts' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/attention', label: 'Attention', icon: 'alert', badge: 'attention' },
      { href: '/printers', label: 'Printers', icon: 'printer', badge: 'printersDown' },
      { href: '/queue', label: 'Print queue', icon: 'queue' },
      { href: '/sessions', label: 'Sessions', icon: 'sessions' },
    ],
  },
  {
    title: 'Money',
    items: [
      { href: '/billing', label: 'Billing', icon: 'billing' },
      { href: '/pricing', label: 'Pricing', icon: 'pricing' },
      { href: '/reports', label: 'Partner comparison', icon: 'reports' },
    ],
  },
  {
    title: 'Growth and control',
    items: [
      { href: '/leads', label: 'Leads', icon: 'leads' },
      { href: '/staff', label: 'Staff and accounts', icon: 'staff' },
      { href: '/permissions', label: 'Permissions', icon: 'permissions' },
      { href: '/audit', label: 'Audit trail', icon: 'audit' },
    ],
  },
];

const isOn = (item: NavItem, pathname: string) =>
  item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(`${item.href}/`);

export function ConsoleShell({ children }: { children: ReactNode }) {
  const data = useConsole();
  const pathname = usePathname();
  const router = useRouter();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [profile, setProfile] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setProfile(readProfile()), []);

  const attention = useResource<{ count: number }>('attention');
  const drafts = useResource<{ count: number }>('onboarding/drafts');

  const { organizations, kiosks, printers, users, priceLists } = data;
  const index = useMemo(() => buildSearchIndex({ organizations, kiosks, printers, users }), [organizations, kiosks, printers, users]);
  const readiness = useMemo(() => {
    const map = new Map<string, Readiness>();
    for (const org of organizations) map.set(org.id, partnerReadiness(org, { kiosks, printers, users, priceLists }));
    return map;
  }, [organizations, kiosks, printers, users, priceLists]);

  const partnerNodes: TreeNode[] = useMemo(
    () =>
      [...organizations]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((org) => ({ id: org.id, label: org.name, href: `/partners/${org.id}`, tone: partnerTone(org), kind: 'Partner' })),
    [organizations]
  );

  const printersDown = printers.filter(
    (p) => !p.enrollment.revokedAt && p.status !== 'revoked' && (p.silent || (p.status !== 'online' && p.status !== 'busy'))
  ).length;

  const badges: Record<BadgeKey, { value: number | null; alert?: boolean }> = {
    partners: { value: data.ready ? organizations.length : null },
    drafts: { value: drafts.data?.count ?? null },
    attention: { value: attention.data?.count ?? null, alert: true },
    printersDown: { value: data.ready ? printersDown : null, alert: true },
  };

  // The drawer closes when the page changes.
  useEffect(() => setDrawerOpen(false), [pathname]);

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

  const reloadAll = () => {
    data.reload();
    attention.reload();
    drafts.reload();
  };

  const rail = (
    <Rail
      pathname={pathname}
      badges={badges}
      partners={partnerNodes}
      readiness={readiness}
      profile={profile}
      signingOut={signingOut}
      onSignOut={() => void onSignOut()}
      onFind={() => {
        setDrawerOpen(false);
        setPaletteOpen(true);
      }}
    />
  );

  return (
    <div className="min-h-[100dvh]">
      {/* Desk: the rail is fixed beside the page. */}
      <aside aria-label="Navigation" className="fixed inset-y-0 left-0 z-30 hidden w-[264px] lg:block">
        {rail}
      </aside>

      {/* Phone and tablet: the same rail, as a drawer. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-[rgb(1_30_20/0.5)]" onClick={() => setDrawerOpen(false)} />
          <aside aria-label="Navigation" className="absolute inset-y-0 left-0 w-[min(86vw,300px)] shadow-sheet">
            {rail}
          </aside>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-3 md:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-raised lg:hidden"
            >
              <Icons.menu />
            </button>
            <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="MPRNT overview">
              <MprntLogo variant="mark" className="h-6 w-auto text-brand-text" aria-hidden />
              <MprntLogo variant="wordmark" title="MPRNT" className="h-3 w-auto text-brand-text" />
            </Link>

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Find a partner, QR point, printer or person"
              className="ml-auto flex h-10 items-center gap-2.5 rounded-lg border border-line bg-bg px-3 text-[13px] text-mute transition hover:border-line-strong md:ml-0 md:w-[min(420px,40vw)]"
            >
              <Icons.search className="h-4 w-4" />
              <span className="hidden min-w-0 flex-1 truncate text-left md:block">Find a partner, QR point, printer or person</span>
              <kbd className="hidden shrink-0 rounded border border-line-strong bg-surface px-1.5 font-mono text-[10.5px] text-mute md:block">⌘K</kbd>
            </button>

            <div className="flex items-center gap-2 md:ml-auto">
              <span className="hidden items-center gap-2 rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-mute xl:inline-flex">
                <span aria-hidden className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
                </span>
                Live · every change is audited
              </span>
              <button
                type="button"
                onClick={reloadAll}
                aria-label="Reload all data"
                title="Reload all data"
                className="grid h-10 w-10 place-items-center rounded-lg text-mute hover:bg-raised hover:text-ink"
              >
                <Icons.refresh className="h-[18px] w-[18px]" />
              </button>
              <Link
                href="/partners/new"
                className="hidden h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-ink transition hover:brightness-110 md:inline-flex"
              >
                <Icons.plus className="h-4 w-4" />
                New partner
              </Link>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-[1560px] px-4 pb-16 pt-5 md:px-8 md:pt-7">
          {data.error && (
            <div className="mb-5">
              <ErrorState error={`Could not load the platform data: ${data.error}`} onRetry={data.reload} />
            </div>
          )}
          {children}
        </main>
      </div>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} index={index} onPick={(href) => router.push(href)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The navigation rail
// ---------------------------------------------------------------------------

function Rail({
  pathname,
  badges,
  partners,
  readiness,
  profile,
  signingOut,
  onSignOut,
  onFind,
}: {
  pathname: string;
  badges: Record<BadgeKey, { value: number | null; alert?: boolean }>;
  partners: TreeNode[];
  readiness: Map<string, Readiness>;
  profile: SessionUser | null;
  signingOut: boolean;
  onSignOut: () => void;
  onFind: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [partnersOpen, setPartnersOpen] = useState(true);
  const shown = filter.trim() ? partners.filter((n) => nodeMatches(n, filter)) : partners;
  const initial = (profile?.email ?? '?').charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col bg-side text-side-ink">
      <Link href="/" className="flex items-center gap-3 px-5 pb-4 pt-5" aria-label="MPRNT overview">
        <MprntLogo variant="mark" className="h-8 w-auto shrink-0 text-side-ink" aria-hidden />
        <span className="min-w-0">
          <MprntLogo variant="wordmark" title="MPRNT" className="block h-[13px] w-auto text-side-ink" />
          <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.16em] text-side-mute">Platform console</span>
        </span>
      </Link>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onFind}
          className="flex h-9 w-full items-center gap-2 rounded-lg bg-white/[0.07] px-3 text-[13px] text-side-mute transition hover:bg-white/[0.11] hover:text-side-ink"
        >
          <Icons.search className="h-4 w-4" />
          <span className="flex-1 text-left">Find anything</span>
          <kbd className="rounded bg-white/10 px-1.5 font-mono text-[10.5px]">⌘K</kbd>
        </button>
      </div>

      <nav className="rail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-side-mute/80">{group.title}</p>
            <ul className="space-y-px">
              {group.items.map((item) => {
                const on = isOn(item, pathname);
                const Icon = Icons[item.icon];
                const badge = item.badge ? badges[item.badge] : null;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={on ? 'page' : undefined}
                      className={cx(
                        'relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition',
                        on ? 'bg-white/[0.12] font-semibold text-side-ink' : 'text-side-ink/80 hover:bg-white/[0.06] hover:text-side-ink'
                      )}
                    >
                      {on && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent" />}
                      <span className={on ? 'text-accent' : 'text-side-mute'}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {badge && <RailBadge value={badge.value} alert={badge.alert} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="mb-2">
          <button
            type="button"
            onClick={() => setPartnersOpen((o) => !o)}
            aria-expanded={partnersOpen}
            className="flex w-full items-center gap-1.5 px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-side-mute/80 hover:text-side-ink"
          >
            <span className={cx('transition', partnersOpen ? 'rotate-0' : '-rotate-90')}>
              <Icons.chevronDown className="h-3.5 w-3.5" />
            </span>
            Partners
            <span className="tnum ml-auto font-bold normal-case tracking-normal">{partners.length}</span>
          </button>
          {partnersOpen && (
            <>
              <label className="relative mb-1.5 block">
                <span className="sr-only">Filter partners</span>
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter partners"
                  className="h-8 w-full rounded-md border border-white/10 bg-white/[0.05] px-2.5 text-[12.5px] text-side-ink placeholder:text-side-mute/70 focus:border-accent/60 focus:outline-none"
                />
              </label>
              <ul className="space-y-px">
                {shown.map((node) => {
                  const on = pathname === node.href || pathname.startsWith(`${node.href}/`);
                  const r = readiness.get(node.id);
                  return (
                    <li key={node.id}>
                      <Link
                        href={node.href}
                        aria-current={on ? 'page' : undefined}
                        className={cx(
                          'relative flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] transition',
                          on ? 'bg-white/[0.12] font-semibold text-side-ink' : 'text-side-ink/75 hover:bg-white/[0.06] hover:text-side-ink'
                        )}
                      >
                        {on && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" />}
                        <StatusDot tone={node.tone} />
                        <span className="min-w-0 flex-1 truncate">{node.label}</span>
                        {r && <ReadinessMeter readiness={r} onRail />}
                      </Link>
                    </li>
                  );
                })}
                {shown.length === 0 && <li className="px-2.5 py-2 text-[12px] text-side-mute">No partner matches “{filter}”.</li>}
              </ul>
            </>
          )}
        </div>
      </nav>

      <div className="border-t border-white/10 p-3">
        <ThemeSwitch onRail className="mb-3 flex w-full" />
        <div className="flex items-center gap-2.5">
          <Link
            href="/account"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 transition hover:bg-white/[0.06]"
            title="My account and password"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-[13px] font-bold text-side">{initial}</span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-side-ink">{profile?.email ?? 'Signed in'}</span>
              <span className="block text-[11px] capitalize text-side-mute">{profile?.role?.replace('_', ' ') ?? 'Platform'}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-side-mute transition hover:bg-white/[0.08] hover:text-side-ink disabled:opacity-50"
          >
            <Icons.logout className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
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
