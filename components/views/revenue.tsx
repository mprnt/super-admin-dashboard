'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { call, qs, seg } from '../../lib/client/api';
import { useConsole } from '../../lib/client/console';
import { count, money } from '../../lib/format';
import { splitRevenue, type RevenueSplit } from '../../lib/revenue.ts';
import type { SessionRow } from '../../lib/types';
import { DataTable } from '../ui/data';
import { Notice, Panel, Pill } from '../ui/primitives';

const PAGE = 200;
/** A safety stop for the paged load: 20 pages, 4,000 jobs. Beyond that the split says so. */
const MAX_PAGES = 20;

interface SessionsPage {
  total: number;
  sessions: SessionRow[];
}

/**
 * Every job in the period, loaded page by page, split across the partner's printers.
 * The split is computed from the same jobs as the partner total, so the two agree
 * by construction; the check at the foot shows it.
 */
export function RevenueByPrinter({ orgId, period, timezone }: { orgId: string; period: string; timezone?: string }) {
  const ctx = useConsole();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printers = useMemo(
    () => ctx.printers.filter((p) => p.organization?.id === orgId).map((p) => ({ printerId: p.printerId, name: p.station.label })),
    [ctx.printers, orgId]
  );

  useEffect(() => {
    let live = true;
    setSessions(null);
    setError(null);
    setTruncated(false);

    (async () => {
      const all: SessionRow[] = [];
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await call<SessionsPage>('GET', `reports/sessions${qs({ organizationId: orgId, period, limit: PAGE, offset })}`);
        all.push(...res.sessions);
        offset += PAGE;
        if (!live) return;
        if (res.sessions.length < PAGE || offset >= res.total) {
          setSessions(all);
          return;
        }
        if (page === MAX_PAGES - 1) setTruncated(true);
      }
      if (live) setSessions(all);
    })().catch((e: unknown) => {
      if (live) setError(e instanceof Error ? e.message : 'Could not load the jobs');
    });

    return () => {
      live = false;
    };
  }, [orgId, period]);

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!sessions) return <Panel title="Revenue by printer">Loading every job in this period…</Panel>;

  const split: RevenueSplit = splitRevenue(sessions, printers);
  const rows = [
    ...split.byPrinter.map((r) => ({ key: r.printerId, ...r, unattributed: false })),
    {
      key: '__unattributed',
      printerId: '',
      name: 'Never reached a printer',
      paidJobs: split.unattributed.paidJobs,
      printed: 0,
      revenue: split.unattributed.revenue,
      share: split.revenue > 0 ? Math.round((split.unattributed.revenue / split.revenue) * 1000) / 10 : null,
      unattributed: true,
    },
  ];

  return (
    <Panel
      title="Revenue by printer"
      hint="Every paid job in this period, credited to the printer that took it. A paid job no printer has taken is shown on its own row."
    >
      <DataTable
        caption="Revenue by printer"
        rows={rows}
        rowKey={(r) => r.key}
        empty="No paid jobs in this period"
        rowHref={(r) => (r.unattributed ? undefined : `/partners/${orgId}/printers/${encodeURIComponent(r.printerId)}`)}
        columns={[
          {
            key: 'name',
            header: 'Printer',
            cell: (r) =>
              r.unattributed ? (
                <span className="inline-flex items-center gap-2">
                  <Pill tone="warn">Not at a printer</Pill>
                </span>
              ) : (
                <span>
                  {r.name}
                  <span className="block font-mono text-xs font-normal text-mute">{r.printerId}</span>
                </span>
              ),
          },
          { key: 'jobs', header: 'Paid jobs', align: 'right', cell: (r) => count(r.paidJobs) },
          { key: 'printed', header: 'Printed', align: 'right', hideMobile: true, cell: (r) => (r.unattributed ? '—' : count(r.printed)) },
          { key: 'rev', header: 'Revenue', align: 'right', cell: (r) => <span className="font-semibold">{money(r.revenue)}</span> },
          { key: 'share', header: 'Share', align: 'right', cell: (r) => (r.share === null ? '—' : `${r.share}%`) },
        ]}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-raised px-4 py-3 text-sm">
        <span className="text-mute">Partner total for this period</span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{money(split.revenue)}</span>
          {split.reconciles ? <Pill tone="ok">Adds up</Pill> : <Pill tone="bad">Does not add up</Pill>}
        </span>
      </div>

      {split.unattributed.paidJobs > 0 && (
        <p className="mt-4 text-sm leading-relaxed text-mute">
          {count(split.unattributed.paidJobs)} paid job{split.unattributed.paidJobs === 1 ? '' : 's'} ({money(split.unattributed.revenue)}) {split.unattributed.paidJobs === 1 ? 'has' : 'have'} no printer.
          Each one is either still waiting in the print queue, because no printer has claimed it, or never reached a printer. They are still revenue to the partner, and they are listed on{' '}
          <Link href={`/partners/${seg(orgId)}/attention`} className="font-medium text-brand-text underline-offset-4 hover:underline">
            Attention
          </Link>{' '}
          until they are printed or refunded.
        </p>
      )}
      {truncated && <div className="mt-4"><Notice tone="warn">This period has more than {count(PAGE * MAX_PAGES)} jobs. The split covers the first {count(PAGE * MAX_PAGES)}. Narrow the period to see all of it.</Notice></div>}
    </Panel>
  );
}
