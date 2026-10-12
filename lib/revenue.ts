/**
 * Splits a partner's paid revenue across its printers, and shows what is left over.
 *
 * The backend credits a job to a printer only through its print-queue row. A paid
 * job that failed before it was ever queued has no printer, so it counts towards
 * the partner's revenue but to no printer. This keeps the two figures reconciling
 * on screen, rather than leaving a printer that reads ₹0 next to a partner that
 * reads ₹103.
 *
 * Pure, so the rule is tested.
 */

import type { SessionRow } from './types.ts';

export interface PrinterRevenue {
  printerId: string;
  name: string;
  paidJobs: number;
  printed: number;
  revenue: number;
  /** Share of the partner's paid revenue, 0–100. Null when the partner has none. */
  share: number | null;
}

export interface RevenueSplit {
  /** Every paid job in the set. */
  paidJobs: number;
  revenue: number;
  byPrinter: PrinterRevenue[];
  /** Paid jobs that never reached a printer. */
  unattributed: { paidJobs: number; revenue: number };
  /** True when the printers and the unattributed rest add back to the total. */
  reconciles: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function splitRevenue(
  sessions: SessionRow[],
  printers: { printerId: string; name: string }[]
): RevenueSplit {
  const paid = sessions.filter((s) => s.paymentStatus === 'paid');
  const revenue = round2(paid.reduce((acc, s) => acc + (s.amount || 0), 0));

  const rows = new Map<string, PrinterRevenue>();
  for (const p of printers) {
    rows.set(p.printerId, { printerId: p.printerId, name: p.name, paidJobs: 0, printed: 0, revenue: 0, share: null });
  }

  let unattributedJobs = 0;
  let unattributedRevenue = 0;

  for (const s of paid) {
    const id = s.printer?.id;
    if (!id) {
      unattributedJobs += 1;
      unattributedRevenue += s.amount || 0;
      continue;
    }
    // A printer that is not in the list (revoked, or moved) still gets its work counted.
    const row =
      rows.get(id) ?? { printerId: id, name: s.printer?.name ?? id, paidJobs: 0, printed: 0, revenue: 0, share: null };
    row.paidJobs += 1;
    if (s.status === 'completed') row.printed += 1;
    row.revenue += s.amount || 0;
    rows.set(id, row);
  }

  const byPrinter = [...rows.values()]
    .map((r) => ({
      ...r,
      revenue: round2(r.revenue),
      share: revenue > 0 ? Math.round((r.revenue / revenue) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));

  const unattributed = { paidJobs: unattributedJobs, revenue: round2(unattributedRevenue) };
  const printerSum = round2(byPrinter.reduce((acc, r) => acc + r.revenue, 0));

  return {
    paidJobs: paid.length,
    revenue,
    byPrinter,
    unattributed,
    reconciles: Math.abs(printerSum + unattributed.revenue - revenue) < 0.005,
  };
}
