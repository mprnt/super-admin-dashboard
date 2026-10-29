/**
 * Whether a Model 1 partner has everything it needs to take paid jobs and be paid:
 * how MPRNT reaches it, where it is paid, what it charges, where customers scan, a
 * printer to print on, and someone who can sign in for it.
 *
 * Worked out from the data the console already holds, so every screen agrees on it.
 */
import type { Kiosk, Organization, PriceList, Printer, StaffUser } from './types';

export type CheckKey = 'contact' | 'bank' | 'upi' | 'rates' | 'qr' | 'printer' | 'online' | 'owner';

export interface ReadinessCheck {
  key: CheckKey;
  label: string;
  done: boolean;
  /** What is there, or what is missing, in a few words. */
  detail: string;
  /** Where on the partner's pages to see or fix it, relative to /partners/<id>. */
  path: string;
}

export interface Readiness {
  checks: ReadinessCheck[];
  done: number;
  total: number;
  missing: ReadinessCheck[];
}

export interface ReadinessInput {
  kiosks: Kiosk[];
  printers: Printer[];
  users: StaffUser[];
  priceLists: PriceList[];
}

const isLive = (p: Printer) => !p.enrollment.revokedAt && p.status !== 'revoked';

export function partnerReadiness(org: Organization, data: ReadinessInput): Readiness {
  const kiosks = data.kiosks.filter((k) => k.organizationId === org.id);
  const activeKiosks = kiosks.filter((k) => k.status === 'active');
  const printers = data.printers.filter((p) => p.organization?.id === org.id && isLive(p));
  const online = printers.filter((p) => (p.status === 'online' || p.status === 'busy') && !p.silent);
  const owners = data.users.filter((u) => u.organizationId === org.id && u.role === 'owner' && u.isActive && !u.deletedAt);
  const ownRate = data.priceLists.find((p) => p.organizationId === org.id && !p.kioskId) ?? null;
  const payout = org.payout;

  const checks: ReadinessCheck[] = [
    {
      key: 'contact',
      label: 'Contact email and phone',
      done: Boolean(org.contactEmail && org.contactPhone),
      detail: org.contactEmail && org.contactPhone ? 'Both on file' : !org.contactEmail && !org.contactPhone ? 'Neither on file' : org.contactEmail ? 'No phone' : 'No email',
      path: '',
    },
    {
      key: 'bank',
      label: 'Bank account',
      done: Boolean(payout?.bankAccountLast4 && payout?.bankIfsc),
      detail: payout?.bankAccountLast4 ? `Ending ${payout.bankAccountLast4}${payout.bankIfsc ? '' : ', no IFSC'}` : 'Not added',
      path: '',
    },
    {
      key: 'upi',
      label: 'UPI ID',
      done: Boolean(payout?.upiId),
      detail: payout?.upiId ?? 'Not added',
      path: '',
    },
    {
      key: 'rates',
      label: 'Own rates',
      done: ownRate !== null,
      detail: ownRate ? `₹${ownRate.bwPerPage} B&W · ₹${ownRate.colorPerPage} colour` : 'On the MPRNT default',
      path: '/pricing',
    },
    {
      key: 'qr',
      label: 'Active QR point',
      done: activeKiosks.length > 0,
      detail: kiosks.length === 0 ? 'None set up' : `${activeKiosks.length} of ${kiosks.length} active`,
      path: '/qr-points',
    },
    {
      key: 'printer',
      label: 'Printer enrolled',
      done: printers.length > 0,
      detail: printers.length === 0 ? 'None enrolled' : `${printers.length} enrolled`,
      path: '/printers',
    },
    {
      key: 'online',
      label: 'Printer online',
      done: online.length > 0,
      detail: printers.length === 0 ? 'No printer to check' : online.length > 0 ? `${online.length} of ${printers.length} online` : 'All offline',
      path: '/printers',
    },
    {
      key: 'owner',
      label: 'Owner account',
      done: owners.length > 0,
      detail: owners[0]?.email ?? 'No active owner',
      path: '/staff',
    },
  ];

  const done = checks.filter((c) => c.done).length;
  return { checks, done, total: checks.length, missing: checks.filter((c) => !c.done) };
}
