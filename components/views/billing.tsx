'use client';

import Link from 'next/link';
import { useState } from 'react';
import { call, messageOf, qs, seg } from '../../lib/client/api';
import { useResource } from '../../lib/client/console';
import { dateTime, money, shortDate } from '../../lib/format';
import type {
  BillingContract,
  BillingInvoice,
  BillingPaymentMethod,
  BillingPhase,
  BillingPlan,
  BillingPortfolioRow,
  Organization,
} from '../../lib/types';
import { DataTable, PageHeader, useToast } from '../ui/data';
import { ConfirmDialog } from '../ui/dialogs';
import { Button, Field, Input, Loading, Notice, Panel, Pill, Stat, Textarea } from '../ui/primitives';

const PHASE: Record<BillingPhase, { tone: 'ok' | 'amber' | 'bad' | 'muted'; label: string }> = {
  awaiting_hardware: { tone: 'muted', label: 'Awaiting hardware payment' },
  not_live: { tone: 'amber', label: 'Not live yet' },
  free: { tone: 'ok', label: 'Free month' },
  active: { tone: 'ok', label: 'Paying' },
  payment_due: { tone: 'amber', label: 'Payment due' },
  overdue: { tone: 'bad', label: 'Overdue' },
};

const METHODS: Array<{ value: BillingPaymentMethod; label: string; needsReference: boolean }> = [
  { value: 'upi', label: 'UPI', needsReference: true },
  { value: 'bank_transfer', label: 'Bank transfer (NEFT/IMPS)', needsReference: true },
  { value: 'cheque', label: 'Cheque', needsReference: true },
  { value: 'cash', label: 'Cash', needsReference: false },
  { value: 'other', label: 'Other', needsReference: false },
];

const INVOICE_TONE: Record<BillingInvoice['status'], { tone: 'ok' | 'amber' | 'bad' | 'muted'; label: string }> = {
  due: { tone: 'amber', label: 'Due' },
  overdue: { tone: 'bad', label: 'Overdue' },
  paid: { tone: 'ok', label: 'Paid' },
  waived: { tone: 'muted', label: 'Waived' },
};

/** Today in India as YYYY-MM-DD, the latest a go-live may be. */
function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Days from today to a date: negative once it has passed. */
function daysFromToday(date: string): number {
  const a = Date.parse(`${todayIst()}T00:00:00+05:30`);
  const b = Date.parse(`${date}T00:00:00+05:30`);
  return Math.round((b - a) / 86_400_000);
}

interface BillingResponse {
  organization: { name: string; businessModel: string | null };
  contract: BillingContract | null;
}

interface PortfolioResponse {
  rows: BillingPortfolioRow[];
  totals: Record<string, number>;
}

/**
 * One partner's Model 1 billing. Every write here is a platform action, and the
 * API refuses it for anyone else.
 */
export function BillingPanel({ org }: { org: Organization }) {
  const toast = useToast();
  const billing = useResource<BillingResponse>(`billing/contract${qs({ organizationId: org.id })}`);
  const plans = useResource<{ plans: BillingPlan[] }>('billing/plans');

  const [saleNote, setSaleNote] = useState('');
  const [confirmSale, setConfirmSale] = useState(false);

  const [liveOn, setLiveOn] = useState('');
  const [liveNote, setLiveNote] = useState('');
  const [confirmLive, setConfirmLive] = useState(false);

  const [target, setTarget] = useState<BillingInvoice | null>(null);
  const [action, setAction] = useState<'paid' | 'waive'>('paid');
  const [method, setMethod] = useState<BillingPaymentMethod>('upi');
  const [reference, setReference] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [confirmSettle, setConfirmSettle] = useState(false);

  const data = billing.data;
  if (!data) return billing.error ? <Notice tone="bad">{billing.error}</Notice> : <Loading />;

  const contract = data.contract;
  const today = todayIst();
  const modelOneCurrent = plans.data?.plans.find((p) => p.effectiveFrom <= new Date().toISOString());
  const notModelOne = data.organization.businessModel !== 'integration';

  const hardwarePaid = contract?.invoices.find((i) => i.kind === 'hardware');
  const hardwareSettled = hardwarePaid ? hardwarePaid.status === 'paid' || hardwarePaid.status === 'waived' : false;
  const liveDateValid = liveOn !== '' && liveOn <= today && (!contract || liveOn >= contract.soldOn);
  const chosenMethod = METHODS.find((m) => m.value === method);
  const referenceValid = !chosenMethod?.needsReference || reference.trim().length >= 3;
  const settleValid = action === 'paid' ? referenceValid : settleNote.trim().length >= 3;

  const recordSale = async () => {
    await call('POST', 'billing/contract', { organizationId: org.id, note: saleNote.trim() });
    toast('Hardware sale recorded');
    setSaleNote('');
    billing.reload();
  };

  const markLive = async () => {
    await call('POST', 'billing/contract/go-live', { organizationId: org.id, goLiveOn: liveOn, note: liveNote.trim() });
    toast('Partner is live. The free month has started.');
    setLiveOn('');
    setLiveNote('');
    billing.reload();
  };

  const settle = async () => {
    if (!target) return;
    await call('POST', `billing/charges/${seg(target.id)}/settle`, {
      action,
      ...(action === 'paid' ? { method, reference: reference.trim() || null } : {}),
      note: settleNote.trim() || null,
    });
    toast(action === 'paid' ? 'Payment recorded' : 'Charge waived');
    setTarget(null);
    setReference('');
    setSettleNote('');
    billing.reload();
  };

  return (
    <Panel
      title="Model 1 billing"
      hint="The hardware sale and the monthly software fee. All prices include GST. The subscription clock starts at go-live."
    >
      {notModelOne && !contract && (
        <Notice tone="warn">
          This partner is not on Model 1, so no hardware sale can be recorded. Change the business model above first.
        </Notice>
      )}

      {!contract && !notModelOne && (
        <div className="space-y-4">
          <p className="text-sm text-ink">
            No hardware sale is recorded for this partner yet.
            {modelOneCurrent ? (
              <>
                {' '}
                Price in force: <strong>{money(modelOneCurrent.hardwarePrice)}</strong> hardware, then{' '}
                <strong>{money(modelOneCurrent.monthlyPrice)}</strong> a month after{' '}
                {modelOneCurrent.freeMonths === 0 ? 'no free months' : `${modelOneCurrent.freeMonths} free month${modelOneCurrent.freeMonths > 1 ? 's' : ''}`}.
              </>
            ) : (
              <> No price is set yet. Publish one under Billing first.</>
            )}
          </p>
          <Field label="Why" hint="Written into the partner’s record. E.g. the order reference.">
            <Textarea value={saleNote} onChange={(e) => setSaleNote(e.target.value)} placeholder="e.g. Order MP-1042, counter sale" />
          </Field>
          <div className="flex justify-end">
            <Button variant="primary" disabled={saleNote.trim().length < 3 || !modelOneCurrent} onClick={() => setConfirmSale(true)}>
              Record hardware sale
            </Button>
          </div>
        </div>
      )}

      {contract && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-mute">Status</p>
              <div className="mt-2">
                <Pill tone={PHASE[contract.phase].tone}>{PHASE[contract.phase].label}</Pill>
              </div>
              <p className="mt-2 text-xs text-mute">
                Sold {shortDate(contract.soldOn, org.timezone)}
                {contract.soldByEmail ? ` by ${contract.soldByEmail}` : ''}
              </p>
            </div>
            <Stat
              label="Hardware"
              value={money(hardwarePaid?.amount ?? contract.terms.hardwarePrice)}
              sub={hardwarePaid ? INVOICE_TONE[hardwarePaid.status].label : undefined}
            />
            <Stat
              label="Software"
              value={`${money(contract.terms.monthlyPrice)} / month`}
              sub={
                contract.terms.freeMonths > 0
                  ? `${contract.terms.freeMonths} free month${contract.terms.freeMonths > 1 ? 's' : ''}${contract.freeUntil ? `, until ${shortDate(contract.freeUntil, org.timezone)}` : ''}`
                  : 'No free month'
              }
            />
            <Stat label="Live since" value={contract.goLiveOn ? shortDate(contract.goLiveOn, org.timezone) : 'Not live'} sub={contract.goLiveByEmail ? `Recorded by ${contract.goLiveByEmail}` : undefined} />
            <Stat label="Paid through" value={contract.paidThrough ? shortDate(contract.paidThrough, org.timezone) : '—'} />
            <Stat
              label="Next payment"
              value={contract.nextPayment ? money(contract.nextPayment.amount) : '—'}
              sub={
                contract.nextPayment
                  ? `${shortDate(contract.nextPayment.dueOn, org.timezone)}${renewalNote(contract.nextPayment.dueOn)}`
                  : undefined
              }
            />
          </div>

          {hardwareSettled && !contract.goLiveOn && (
            <div className="rounded-2xl border border-line p-4">
              <h3 className="text-sm font-medium text-ink">Go live</h3>
              <p className="mt-1 text-xs text-mute">
                The free month and the subscription clock start on this date. It cannot be in the future or before the sale.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Live from" error={liveOn !== '' && !liveDateValid ? 'Pick a date from the sale up to today' : null}>
                  <Input type="date" min={contract.soldOn} max={today} value={liveOn} onChange={(e) => setLiveOn(e.target.value)} />
                </Field>
                <Field label="Why" hint="E.g. installed and printing, confirmed by the partner">
                  <Textarea value={liveNote} onChange={(e) => setLiveNote(e.target.value)} />
                </Field>
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant="primary" disabled={!liveDateValid || liveNote.trim().length < 3} onClick={() => setConfirmLive(true)}>
                  Review go-live
                </Button>
              </div>
            </div>
          )}

          {!hardwareSettled && (
            <Notice tone="warn">The hardware must be paid or waived before the partner can go live.</Notice>
          )}

          <DataTable
            caption="Invoices"
            rows={contract.invoices}
            rowKey={(i) => i.id}
            empty="No invoices yet"
            columns={[
              { key: 'what', header: 'For', cell: (i) => i.label },
              {
                key: 'period',
                header: 'Covers',
                cell: (i) => (i.kind === 'hardware' ? '—' : `${shortDate(i.periodStart, org.timezone)} to ${shortDate(i.periodEnd, org.timezone)}`),
              },
              { key: 'amount', header: 'Amount', cell: (i) => money(i.amount) },
              { key: 'due', header: 'Due', cell: (i) => shortDate(i.dueOn, org.timezone) },
              { key: 'status', header: 'Status', cell: (i) => <Pill tone={INVOICE_TONE[i.status].tone}>{INVOICE_TONE[i.status].label}</Pill> },
              {
                key: 'record',
                header: 'Record',
                cell: (i) => {
                  if (i.status === 'paid' || i.status === 'waived') {
                    return (
                      <span className="text-xs text-mute">
                        {i.status === 'paid'
                          ? `${i.paidOn ? shortDate(i.paidOn, org.timezone) : ''} · ${i.paymentMethod ?? ''} ${i.paymentReference ? `· ${i.paymentReference}` : ''}`
                          : `Waived${i.settleNote ? `: ${i.settleNote}` : ''}`}
                        {i.settledByEmail ? ` · ${i.settledByEmail}` : ''}
                      </span>
                    );
                  }
                  return (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="primary" onClick={() => { setTarget(i); setAction('paid'); }}>
                        Record payment
                      </Button>
                      <Button size="sm" onClick={() => { setTarget(i); setAction('waive'); }}>
                        Waive
                      </Button>
                    </div>
                  );
                },
              },
            ]}
          />

          {target && (
            <div className="rounded-2xl border border-line p-4">
              <h3 className="text-sm font-medium text-ink">
                {action === 'paid' ? 'Record a payment' : 'Waive a charge'}: {target.label}
              </h3>
              <p className="mt-1 text-xs text-mute">
                {money(target.amount)}, due {shortDate(target.dueOn, org.timezone)}. The amount is the full invoice; partial payments are not recorded.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {action === 'paid' ? (
                  <>
                    <Field label="How it was paid">
                      <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value as BillingPaymentMethod)}
                        className="w-full rounded-2xl border border-line bg-bg px-2.5 py-2 text-base text-ink focus:border-brand-text focus:outline-none md:text-sm"
                      >
                        {METHODS.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label={chosenMethod?.needsReference ? 'Reference (UTR, UPI ref or cheque no.)' : 'Reference (optional)'}
                      error={chosenMethod?.needsReference && reference !== '' && reference.trim().length < 3 ? 'Enter the reference from the payment' : null}
                    >
                      <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="Note (optional)">
                        <Textarea value={settleNote} onChange={(e) => setSettleNote(e.target.value)} />
                      </Field>
                    </div>
                  </>
                ) : (
                  <div className="md:col-span-2">
                    <Field label="Why it is waived" hint="At least 3 characters. Recorded in the partner’s history.">
                      <Textarea value={settleNote} onChange={(e) => setSettleNote(e.target.value)} />
                    </Field>
                  </div>
                )}
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button onClick={() => setTarget(null)}>Cancel</Button>
                <Button variant="primary" disabled={!settleValid} onClick={() => setConfirmSettle(true)}>
                  Review
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmSale}
        onClose={() => setConfirmSale(false)}
        title="Record the hardware sale?"
        danger
        requireText={org.name}
        confirmLabel="Record sale"
        body={
          <>
            Records the Model 1 hardware sale to <strong className="text-ink">{org.name}</strong>. The hardware
            invoice of <strong className="text-ink">{money(modelOneCurrent?.hardwarePrice ?? 0)}</strong> is raised
            now, and the prices in force today are fixed on this contract.
          </>
        }
        onConfirm={async () => {
          try {
            await recordSale();
            setConfirmSale(false);
          } catch (err) {
            toast(messageOf(err));
            throw err;
          }
        }}
      />

      <ConfirmDialog
        open={confirmLive}
        onClose={() => setConfirmLive(false)}
        title="Mark the partner live?"
        danger
        requireText={org.name}
        confirmLabel="Go live"
        body={
          <>
            The free month starts on <strong className="text-ink">{shortDate(liveOn, org.timezone)}</strong>. The
            first software invoice follows on the first day after the free month.
          </>
        }
        onConfirm={async () => {
          try {
            await markLive();
            setConfirmLive(false);
          } catch (err) {
            toast(messageOf(err));
            throw err;
          }
        }}
      />

      <ConfirmDialog
        open={confirmSettle}
        onClose={() => setConfirmSettle(false)}
        title={action === 'paid' ? 'Record this payment?' : 'Waive this charge?'}
        danger
        requireText={org.name}
        confirmLabel={action === 'paid' ? 'Record payment' : 'Waive charge'}
        body={
          target ? (
            action === 'paid' ? (
              <>
                <strong className="text-ink">{money(target.amount)}</strong> for {target.label}, paid by{' '}
                {METHODS.find((m) => m.value === method)?.label.toLowerCase()}. Recorded once; it cannot be changed afterwards.
              </>
            ) : (
              <>
                {target.label} for <strong className="text-ink">{money(target.amount)}</strong> is waived and will not be
                collected. This is recorded in the audit trail.
              </>
            )
          ) : null
        }
        onConfirm={async () => {
          try {
            await settle();
            setConfirmSettle(false);
          } catch (err) {
            toast(messageOf(err));
            throw err;
          }
        }}
      />
    </Panel>
  );
}

function renewalNote(dueOn: string): string {
  const days = daysFromToday(dueOn);
  if (days < 0) return ` · ${-days} day${days === -1 ? '' : 's'} ago`;
  if (days === 0) return ' · today';
  return ` · in ${days} day${days === 1 ? '' : 's'}`;
}

/** The platform's billing pages: the sales portfolio, and the prices. */
export function BillingOverview() {
  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: 'Platform', href: '/' }, { label: 'Billing' }]}
        title="Billing"
        meta="Model 1: the hardware sale, and the monthly software fee after the free month."
      />
      <PortfolioSection />
      <PlansSection />
    </div>
  );
}

function PortfolioSection() {
  const portfolio = useResource<PortfolioResponse>('billing/contracts');
  if (!portfolio.data) return portfolio.error ? <Notice tone="bad">{portfolio.error}</Notice> : <Loading />;

  const t = portfolio.data.totals;
  return (
    <Panel title="Sales and subscriptions" hint="Every Model 1 partner, as of today. Open a partner to record a payment.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Partners on Model 1" value={String(t.contracts ?? 0)} />
        <Stat label="Live" value={String((t.free ?? 0) + (t.active ?? 0) + (t.payment_due ?? 0) + (t.overdue ?? 0))} />
        <Stat label="Payment due or overdue" value={String((t.payment_due ?? 0) + (t.overdue ?? 0))} tone={(t.overdue ?? 0) > 0 ? 'bad' : undefined} />
        <Stat label="Software overdue" value={money(t.software_overdue_amount ?? 0)} tone={(t.software_overdue_amount ?? 0) > 0 ? 'bad' : undefined} />
      </div>
      <div className="mt-4">
        <DataTable
          caption="Partners on Model 1"
          rows={portfolio.data.rows}
          rowKey={(r) => r.organizationId}
          empty="No Model 1 sale has been recorded yet"
          columns={[
            {
              key: 'partner',
              header: 'Partner',
              cell: (r) => (
                <Link className="text-brand-text hover:underline" href={`/partners/${seg(r.organizationId)}/model`}>
                  {r.organizationName}
                </Link>
              ),
            },
            { key: 'phase', header: 'Status', cell: (r) => <Pill tone={PHASE[r.phase].tone}>{PHASE[r.phase].label}</Pill> },
            { key: 'hw', header: 'Hardware', cell: (r) => `${money(r.hardwarePrice)} · ${r.hardwareStatus}` },
            { key: 'live', header: 'Live since', cell: (r) => (r.goLiveOn ? shortDate(r.goLiveOn) : '—') },
            { key: 'paid', header: 'Paid through', cell: (r) => (r.paidThrough ? shortDate(r.paidThrough) : '—') },
            {
              key: 'next',
              header: 'Next payment',
              cell: (r) => (r.nextPayment ? `${money(r.nextPayment.amount)} on ${shortDate(r.nextPayment.dueOn)}` : '—'),
            },
            { key: 'overdue', header: 'Overdue', cell: (r) => (r.overdueCount > 0 ? `${money(r.overdueAmount)} (${r.overdueCount})` : '—') },
          ]}
        />
      </div>
    </Panel>
  );
}

function PlansSection() {
  const toast = useToast();
  const plans = useResource<{ plans: BillingPlan[] }>('billing/plans');

  const [hardware, setHardware] = useState('');
  const [monthly, setMonthly] = useState('');
  const [freeMonths, setFreeMonths] = useState('1');
  const [graceDays, setGraceDays] = useState('5');
  const [startMode, setStartMode] = useState<'now' | 'date'>('now');
  const [startDate, setStartDate] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);

  if (!plans.data) return plans.error ? <Notice tone="bad">{plans.error}</Notice> : <Loading />;

  const now = new Date().toISOString();
  const inForce = plans.data.plans.find((p) => p.effectiveFrom <= now);
  const money2 = (v: string) => /^\d{1,6}(\.\d{1,2})?$/.test(v.trim());
  const valid =
    money2(hardware) &&
    Number(hardware) > 0 &&
    money2(monthly) &&
    /^\d{1,2}$/.test(freeMonths) && Number(freeMonths) <= 12 &&
    /^\d{1,2}$/.test(graceDays) && Number(graceDays) <= 60 &&
    (startMode === 'now' || startDate >= todayIst()) &&
    note.trim().length >= 3;

  const publish = async () => {
    await call('POST', 'billing/plans', {
      hardwarePrice: Number(hardware),
      monthlyPrice: Number(monthly),
      freeMonths: Number(freeMonths),
      graceDays: Number(graceDays),
      ...(startMode === 'date' ? { effectiveFrom: `${startDate}T00:00:00+05:30` } : {}),
      note: note.trim(),
    });
    toast('Price published. Existing partners keep the prices they were sold on.');
    setHardware('');
    setMonthly('');
    setNote('');
    setStartMode('now');
    setStartDate('');
    plans.reload();
  };

  return (
    <Panel title="Model 1 prices" hint="GST-inclusive. A new price applies to partners sold from its start; existing partners keep the prices they were sold on.">
      {inForce ? (
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Hardware" value={money(inForce.hardwarePrice)} sub="incl. GST" />
          <Stat label="Software" value={`${money(inForce.monthlyPrice)} / month`} sub="incl. GST" />
          <Stat label="Free months" value={String(inForce.freeMonths)} sub="from go-live" />
          <Stat label="Grace" value={`${inForce.graceDays} days`} sub="before a payment is overdue" />
        </div>
      ) : (
        <Notice tone="warn">No Model 1 price is in force yet. No sale can be recorded until one is published.</Notice>
      )}

      <div className="mt-6 rounded-2xl border border-line p-4">
        <h3 className="text-sm font-medium text-ink">Publish a new price</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Hardware (₹, incl. GST)" error={hardware !== '' && !money2(hardware) ? 'Enter an amount, up to two decimals' : null}>
            <Input inputMode="decimal" placeholder="18999" value={hardware} onChange={(e) => setHardware(e.target.value)} />
          </Field>
          <Field label="Software per month (₹, incl. GST)" error={monthly !== '' && !money2(monthly) ? 'Enter an amount, up to two decimals' : null}>
            <Input inputMode="decimal" placeholder="499" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </Field>
          <Field label="Free months after go-live" error={!/^\d{1,2}$/.test(freeMonths) || Number(freeMonths) > 12 ? 'A whole number from 0 to 12' : null}>
            <Input inputMode="numeric" value={freeMonths} onChange={(e) => setFreeMonths(e.target.value)} />
          </Field>
          <Field label="Grace days before overdue" error={!/^\d{1,2}$/.test(graceDays) || Number(graceDays) > 60 ? 'A whole number from 0 to 60' : null}>
            <Input inputMode="numeric" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
          </Field>
          <Field label="Starts">
            <select
              value={startMode}
              onChange={(e) => setStartMode(e.target.value as 'now' | 'date')}
              className="w-full rounded-2xl border border-line bg-bg px-2.5 py-2 text-base text-ink focus:border-brand-text focus:outline-none md:text-sm"
            >
              <option value="now">Now</option>
              <option value="date">On a date (midnight IST)</option>
            </select>
          </Field>
          {startMode === 'date' && (
            <Field label="Start date">
              <Input type="date" min={todayIst()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
          )}
          <div className="md:col-span-2 xl:col-span-3">
            <Field label="Why" hint="Written into the price history.">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Revised list price for the November launch" />
            </Field>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" disabled={!valid} onClick={() => setConfirming(true)}>
            Review price
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <DataTable
          caption="Price history"
          rows={plans.data.plans}
          rowKey={(p) => p.id}
          empty="No price has been published"
          columns={[
            { key: 'from', header: 'Starts', cell: (p) => dateTime(p.effectiveFrom, 'Asia/Kolkata') },
            { key: 'hw', header: 'Hardware', cell: (p) => money(p.hardwarePrice) },
            { key: 'sw', header: 'Software / month', cell: (p) => money(p.monthlyPrice) },
            { key: 'free', header: 'Free months', cell: (p) => String(p.freeMonths) },
            { key: 'grace', header: 'Grace', cell: (p) => `${p.graceDays} days` },
            { key: 'why', header: 'Why', cell: (p) => p.note },
            { key: 'by', header: 'By', cell: (p) => p.createdByEmail ?? '—' },
          ]}
        />
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Publish this Model 1 price?"
        danger
        requireText="PUBLISH"
        confirmLabel="Publish"
        body={
          <>
            Hardware <strong className="text-ink">{money(Number(hardware))}</strong>, then{' '}
            <strong className="text-ink">{money(Number(monthly))}</strong> a month after{' '}
            <strong className="text-ink">{freeMonths}</strong> free month{freeMonths === '1' ? '' : 's'}, all incl. GST. It
            applies to new sales {startMode === 'now' ? 'from now' : `from ${startDate}, midnight IST`}. Partners already sold
            keep their own prices.
          </>
        }
        onConfirm={async () => {
          try {
            await publish();
            setConfirming(false);
          } catch (err) {
            toast(messageOf(err));
            throw err;
          }
        }}
      />
    </Panel>
  );
}
