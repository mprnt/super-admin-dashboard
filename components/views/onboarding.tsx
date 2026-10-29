'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, call, messageOf, qs, seg, upload } from '../../lib/client/api';
import { useResource } from '../../lib/client/console';
import { dateTime } from '../../lib/format';
import {
  BUSINESS_TYPES,
  DOCUMENT_ACCEPT,
  FieldErrors,
  INDIAN_STATES,
  STEPS,
  checkBusiness,
  checkDocumentFile,
  checkOwner,
  checkPayout,
  checkQrPoint,
  stepForField,
} from '../../lib/onboarding';
import type { DraftPatch, OnboardingDraft, OnboardingPayload, OnboardingResult } from '../../lib/types';

/** A document chosen on this page and not yet saved to the draft. */
interface StagedDocument {
  id: string;
  kind: 'gst_certificate' | 'agreement' | 'other';
  file: File;
}

/** A document as the wizard shows it: saved to the draft, or still held here. */
interface DocumentView {
  id: string;
  kind: string;
  originalFilename: string;
  sizeBytes: number;
}

interface Problem {
  field: string;
  message: string;
}

/** The field prefix each step's own problems carry, so a problem can be sent back to its step. */
const STEP_PREFIX = ['business', 'documents', 'qrPoint', 'owner', 'payout'] as const;

/** One list of problems, with a field named by the server or this page only once. */
function mergeProblems(local: Problem[], server: Problem[]): Problem[] {
  const seen = new Set<string>();
  return [...local, ...server].filter((p) => {
    const key = `${p.field}|${p.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
import { useToast } from '../ui/data';
import { ConfirmDialog } from '../ui/dialogs';
import { Button, Field, Input, Loading, Notice, Panel, Pill, Select, Textarea, cx } from '../ui/primitives';
import { QrStandPreview } from './qr-stand';

const inputClass = 'min-h-[44px] md:min-h-0';
const selectClass = 'w-full rounded-2xl border border-line bg-bg px-2.5 py-2 text-base text-ink focus:border-brand-text focus:outline-none md:text-sm';

/** The new-partner wizard. The draft is saved on the server as the operator works. */
export function NewPartnerWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  // Nothing is written to the server while the operator works. `draft` is set only once a
  // draft has been saved (by Save draft), or when the page was opened on a saved one.
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [answers, setAnswers] = useState<OnboardingPayload>({});
  const [staged, setStaged] = useState<StagedDocument[]>([]);
  const [loading, setLoading] = useState(Boolean(params.get('draft')));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ tone: 'warn' | 'bad'; text: string; restart?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  // A draft that was saved earlier opens when the URL names it.
  useEffect(() => {
    const id = params.get('draft');
    if (!id) return;
    let cancelled = false;
    call<OnboardingDraft>('GET', `onboarding/drafts/${id}`)
      .then((d) => {
        if (!cancelled) adopt(d);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          setNotice({ tone: 'warn', text: 'This draft is no longer available. Start a new partner.', restart: true });
        } else {
          setNotice({ tone: 'bad', text: messageOf(err) });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The draft is opened once per visit to the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function adopt(d: OnboardingDraft) {
    setDraft(d);
    setAnswers(d.payload ?? {});
    if (d.status === 'expired') {
      setNotice({ tone: 'warn', text: 'This draft expired after 7 days without changes. Start a new partner.', restart: true });
    } else if (d.status === 'completed') {
      setNotice({ tone: 'warn', text: 'This draft already became a partner.', restart: true });
    }
  }

  function startOver() {
    setDraft(null);
    setAnswers({});
    setStaged([]);
    setStep(0);
    setErrors({});
    setNotice(null);
    setResult(null);
    router.replace('/partners/new');
  }

  /**
   * Writes the whole wizard to a draft: creates the draft if there is none, saves every
   * answer, and uploads the staged documents. Only Save draft and Create partner call this.
   */
  async function persist(): Promise<OnboardingDraft | null> {
    setBusy(true);
    try {
      const current = draft ?? (await call<OnboardingDraft>('POST', 'onboarding/drafts'));
      if (!draft) router.replace(`/partners/new?draft=${current.id}`);

      const patch: DraftPatch = {
        business: answers.business,
        model: { businessModel: 'integration' },
        qrPoint: answers.qrPoint ?? null,
        owner: answers.owner,
        payout: payoutFor(answers.payout),
      };
      await call<OnboardingDraft>('PUT', `onboarding/drafts/${current.id}`, { version: current.version, patch });

      for (const doc of staged) {
        const form = new FormData();
        form.append('kind', doc.kind);
        form.append('document', doc.file, doc.file.name);
        await upload(`onboarding/drafts/${current.id}/documents`, form);
      }

      const saved = await call<OnboardingDraft>('GET', `onboarding/drafts/${current.id}`);
      setStaged([]);
      adopt(saved);
      setNotice(null);
      return saved;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        setNotice({ tone: 'bad', text: 'This draft was changed in another window. Reload the page to continue from the latest save.' });
      } else if (err instanceof ApiError && err.status === 410) {
        setNotice({ tone: 'warn', text: 'This draft expired. Start a new partner.', restart: true });
      } else {
        setNotice({ tone: 'bad', text: messageOf(err) });
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    const saved = await persist();
    if (saved) toast('Draft saved. It is kept for 7 days without changes.');
  }

  /** Checks the step's own answers, then moves on. Nothing is saved by moving. */
  function next() {
    const found = validate(step, answers, hasGstCert);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  /** A document is held here until the draft is saved. Only one of each kind is kept. */
  function uploadDocument(kind: 'gst_certificate' | 'agreement' | 'other', file: File) {
    const problem = checkDocumentFile(file);
    if (problem) {
      setNotice({ tone: 'bad', text: problem });
      return;
    }
    setNotice(null);
    setStaged((list) => [...list.filter((d) => d.kind !== kind), { id: `staged-${kind}-${Date.now()}`, kind, file }]);
  }

  /** Removes a document held here at once. A document already saved to the draft is removed from it. */
  async function removeDocument(docId: string) {
    if (docId.startsWith('staged-')) {
      setStaged((list) => list.filter((d) => d.id !== docId));
      return;
    }
    if (!draft) return;
    setBusy(true);
    try {
      await call('DELETE', `onboarding/drafts/${draft.id}/documents/${docId}`);
      adopt(await call<OnboardingDraft>('GET', `onboarding/drafts/${draft.id}`));
    } catch (err) {
      setNotice({ tone: 'bad', text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  /** Saves everything, then creates the partner. A problem the server finds is shown on the review. */
  async function create() {
    setConfirming(false);
    const saved = await persist();
    if (!saved) return;
    setBusy(true);
    try {
      const r = await call<OnboardingResult>('POST', `onboarding/drafts/${saved.id}/complete`);
      setResult(r);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'DRAFT_COMPLETED') {
        setNotice({ tone: 'warn', text: 'This partner was already created from this draft.', restart: true });
      } else {
        setNotice({ tone: 'bad', text: messageOf(err) });
        adopt(await call<OnboardingDraft>('GET', `onboarding/drafts/${saved.id}`).catch(() => saved));
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast('Could not copy. Select the password and copy it by hand.');
    }
  }

  if (result) {
    return <Created result={result} acknowledged={acknowledged} setAcknowledged={setAcknowledged} copied={copied} copyPassword={copyPassword} />;
  }

  if (loading) return <Loading label="Opening the draft" />;

  const b = answers.business ?? {};
  const docs: DocumentView[] = [
    ...(draft?.documents ?? []),
    ...staged.map((d) => ({ id: d.id, kind: d.kind, originalFilename: d.file.name, sizeBytes: d.file.size })),
  ];
  const hasGstCert = docs.some((d) => d.kind === 'gst_certificate');
  const readOnly = draft !== null && draft.status !== 'open';

  // What is blocking, from this page's own answers, plus anything the server already found.
  const localProblems = [0, 1, 2, 3, 4].flatMap((i) =>
    Object.entries(validate(i, answers, hasGstCert)).map(([field, message]) => ({
      field: field.includes('.') ? field : `${STEP_PREFIX[i]}.${field}`,
      message,
    }))
  );
  const problems = mergeProblems(localProblems, draft?.problems ?? []);
  const conflicts = draft?.conflicts ?? [];
  const counts = STEPS.map((_, i) => problems.filter((p) => stepForField(p.field) === i).length);

  return (
    <div className="space-y-6">
      <Stepper current={step} counts={counts} onPick={(s) => { if (s <= step) setStep(s); }} />

      {notice && (
        <div className="space-y-3">
          <Notice tone={notice.tone}>{notice.text}</Notice>
          {notice.restart && <Button variant="primary" onClick={startOver}>Start a new partner</Button>}
        </div>
      )}

      <Panel title={STEPS[step]?.label ?? ''} hint={stepHint(step)}>
        {step === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Trading name" hint="What the shop calls itself. Shown to the shop and on receipts." error={errors.tradingName}>
              <Input className={inputClass} value={b.tradingName ?? ''} onChange={(e) => set('business', { tradingName: e.target.value })} />
            </Field>
            <Field label="Legal name" hint="As it appears on GST or the registration." error={errors.legalName}>
              <Input className={inputClass} value={b.legalName ?? ''} onChange={(e) => set('business', { legalName: e.target.value })} />
            </Field>
            <Field label="Type of business" error={errors.businessType}>
              <Select className={selectClass} value={b.businessType ?? ''} onChange={(e) => set('business', { businessType: e.target.value as never })}>
                <option value="">Choose…</option>
                {BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="State" error={errors.state}>
              <Select className={selectClass} value={b.state ?? ''} onChange={(e) => set('business', { state: e.target.value })}>
                <option value="">Choose…</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Address" error={errors.addressLine1}>
                <Input className={inputClass} value={b.addressLine1 ?? ''} placeholder="Shop number, building, street" onChange={(e) => set('business', { addressLine1: e.target.value })} />
              </Field>
            </div>
            <Field label="Address line 2 (optional)">
              <Input className={inputClass} value={b.addressLine2 ?? ''} onChange={(e) => set('business', { addressLine2: e.target.value })} />
            </Field>
            <Field label="City" error={errors.city}>
              <Input className={inputClass} value={b.city ?? ''} onChange={(e) => set('business', { city: e.target.value })} />
            </Field>
            <Field label="Pincode" error={errors.pincode}>
              <Input className={inputClass} inputMode="numeric" maxLength={6} value={b.pincode ?? ''} onChange={(e) => set('business', { pincode: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="Contact person" error={errors.contactName}>
              <Input className={inputClass} value={b.contactName ?? ''} onChange={(e) => set('business', { contactName: e.target.value })} />
            </Field>
            <Field label="Contact mobile" error={errors.contactPhone}>
              <Input className={inputClass} inputMode="tel" value={b.contactPhone ?? ''} placeholder="10-digit mobile" onChange={(e) => set('business', { contactPhone: e.target.value })} />
            </Field>
            <Field label="Billing email" hint="Invoices and payment reminders go here." error={errors.billingEmail}>
              <Input className={inputClass} type="email" value={b.billingEmail ?? ''} onChange={(e) => set('business', { billingEmail: e.target.value })} />
            </Field>

            <fieldset className="md:col-span-2">
              <legend className="mb-1.5 text-sm font-medium text-ink">Is the business registered for GST?</legend>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { value: true, label: 'Yes, GST-registered', hint: 'We need the GST number and its certificate.' },
                  { value: false, label: 'No, not registered', hint: 'No GST number is needed.' },
                ].map((opt) => (
                  <label key={String(opt.value)} className={cx('flex cursor-pointer gap-3 rounded-2xl border p-3', b.gstRegistered === opt.value ? 'border-brand-text bg-brand-soft/40' : 'border-line')}>
                    <input
                      type="radio"
                      name="gst"
                      className="mt-1"
                      checked={b.gstRegistered === opt.value}
                      onChange={() => set('business', { gstRegistered: opt.value, ...(opt.value ? {} : { gstNumber: null }) })}
                    />
                    <span>
                      <span className="block text-sm font-medium text-ink">{opt.label}</span>
                      <span className="block text-xs text-mute">{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.gstRegistered && <p className="mt-1 text-xs text-bad">{errors.gstRegistered}</p>}
            </fieldset>

            {b.gstRegistered && (
              <>
                <Field label="GST number" hint="15 characters, as printed on the certificate" error={errors.gstNumber}>
                  <Input className={inputClass} value={b.gstNumber ?? ''} maxLength={15} autoCapitalize="characters" onChange={(e) => set('business', { gstNumber: e.target.value.toUpperCase().replace(/\s/g, '') })} />
                </Field>
                <Field label="PAN (optional)" hint="Filled from the GST number if left empty" error={errors.pan}>
                  <Input className={inputClass} value={b.pan ?? ''} maxLength={10} autoCapitalize="characters" onChange={(e) => set('business', { pan: e.target.value.toUpperCase() })} />
                </Field>
              </>
            )}

            <div className="md:col-span-2">
              <Field label="Internal notes (optional)" hint="Only the platform team sees these.">
                <Textarea value={b.notes ?? ''} onChange={(e) => set('business', { notes: e.target.value })} />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <DocumentSlot
              title="GST certificate"
              required={!!b.gstRegistered}
              note={b.gstRegistered ? 'Required for a GST-registered business.' : 'Not needed for an unregistered business. Upload it only if one exists.'}
              docs={docs.filter((d) => d.kind === 'gst_certificate')}
              kind="gst_certificate"
              disabled={readOnly || busy}
              onUpload={uploadDocument}
              onRemove={removeDocument}
              error={errors['documents.gst_certificate']}
            />
            <DocumentSlot
              title="Agreement or other document (optional)"
              required={false}
              note="The signed agreement or any other document for this partner. One file at a time."
              docs={docs.filter((d) => d.kind !== 'gst_certificate')}
              kind="agreement"
              disabled={readOnly || busy}
              onUpload={uploadDocument}
              onRemove={removeDocument}
            />
            {!hasGstCert && b.gstRegistered && <Notice tone="warn">Upload the GST certificate before continuing.</Notice>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={!!answers.qrPoint}
                onChange={(e) => setAnswers((a) => ({ ...a, qrPoint: e.target.checked ? { code: '', name: '', location: '', paperSizes: ['a4'] } : null }))}
              />
              Create the first QR point now
            </label>
            {answers.qrPoint && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="QR code" hint="2 to 10 letters, digits or hyphens. Printed on the code." error={errors['qrPoint.code']}>
                  <Input className={inputClass} value={answers.qrPoint.code ?? ''} maxLength={10} autoCapitalize="characters" onChange={(e) => setQr({ code: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Name" hint="e.g. Front counter" error={errors['qrPoint.name']}>
                  <Input className={inputClass} value={answers.qrPoint.name ?? ''} onChange={(e) => setQr({ name: e.target.value })} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Location" error={errors['qrPoint.location']}>
                    <Input className={inputClass} value={answers.qrPoint.location ?? ''} onChange={(e) => setQr({ location: e.target.value })} />
                  </Field>
                </div>
                <fieldset className="md:col-span-2">
                  <legend className="mb-1.5 text-sm font-medium text-ink">Paper sizes</legend>
                  <div className="flex flex-wrap gap-4">
                    {['a4', 'a5', 'letter', 'legal'].map((p) => (
                      <label key={p} className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={(answers.qrPoint?.paperSizes ?? []).includes(p)}
                          onChange={(e) => {
                            const cur = answers.qrPoint?.paperSizes ?? [];
                            setQr({ paperSizes: e.target.checked ? [...cur, p] : cur.filter((x) => x !== p) });
                          }}
                        />
                        {p.toUpperCase()}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {answers.qrPoint && !checkQrPoint(answers.qrPoint).code && (
                  <div className="border-t border-line pt-5 md:col-span-2">
                    <QrStandPreview code={answers.qrPoint.code ?? ''} partner={answers.business?.tradingName ?? ''} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Owner’s full name" error={errors['owner.fullName']}>
                <Input className={inputClass} value={answers.owner?.fullName ?? ''} onChange={(e) => setOwner({ fullName: e.target.value })} />
              </Field>
              <Field label="Owner’s email" hint="This is their sign-in." error={errors['owner.email']}>
                <Input className={inputClass} type="email" value={answers.owner?.email ?? ''} onChange={(e) => setOwner({ email: e.target.value })} />
              </Field>
              <Field label="Owner’s mobile (optional)" error={errors['owner.phone']}>
                <Input className={inputClass} inputMode="tel" value={answers.owner?.phone ?? ''} onChange={(e) => setOwner({ phone: e.target.value })} />
              </Field>
            </div>
            <Notice tone="info">
              The owner gets a temporary password when the partner is created. It is shown once, here. They must change it the first time they sign in.
            </Notice>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Account holder" hint="As it appears on the bank account. Optional." error={errors['payout.bankAccountHolder']}>
                <Input className={inputClass} value={answers.payout?.bankAccountHolder ?? ''} onChange={(e) => setPayout({ bankAccountHolder: e.target.value })} />
              </Field>
              <Field label="Bank" error={errors['payout.bankName']}>
                <Input className={inputClass} value={answers.payout?.bankName ?? ''} onChange={(e) => setPayout({ bankName: e.target.value })} />
              </Field>
              <Field
                label="Account number"
                hint={answers.payout?.bankAccountLast4 ? `Saved, ending ${answers.payout.bankAccountLast4}. Type a new number to change it.` : 'Digits only. Stored encrypted.'}
                error={errors['payout.bankAccountNumber']}
              >
                <Input
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="off"
                  value={answers.payout?.bankAccountNumber ?? ''}
                  onChange={(e) => setPayout({ bankAccountNumber: e.target.value.replace(/\s+/g, '') })}
                />
              </Field>
              <Field label="IFSC" hint="11 characters, for example HDFC0001234" error={errors['payout.bankIfsc']}>
                <Input
                  className={inputClass}
                  maxLength={11}
                  autoCapitalize="characters"
                  value={answers.payout?.bankIfsc ?? ''}
                  onChange={(e) => setPayout({ bankIfsc: e.target.value.toUpperCase() })}
                />
              </Field>
            </div>
            <Field label="UPI ID" hint="For example sharma@hdfc. Optional." error={errors['payout.upiId']}>
              <Input className={inputClass} value={answers.payout?.upiId ?? ''} onChange={(e) => setPayout({ upiId: e.target.value })} />
            </Field>
            <Notice tone="info">
              Bank and UPI details can wait. If they are left out, the shop adds them from its own dashboard, and they can be added here later.
            </Notice>
          </div>
        )}

        {step === 5 && (
          <Review problems={problems} conflicts={conflicts} docs={docs} answers={answers} onEdit={setStep} onCreate={() => setConfirming(true)} busy={busy} />
        )}
      </Panel>

      {!readOnly && (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button onClick={back} disabled={step === 0 || busy}>Back</Button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button onClick={() => void saveDraft()} disabled={busy}>
              {busy ? 'Saving…' : 'Save draft'}
            </Button>
            {step < STEPS.length - 2 && (
              <Button variant="primary" onClick={next} disabled={busy}>
                Continue
              </Button>
            )}
          </div>
        </div>
      )}
      {!readOnly && (
        <p className="text-xs text-mute sm:text-right">
          Nothing is saved while you work. Choose Save draft to keep your answers for 7 days, or create the partner to save everything at once.
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Create this partner?"
        danger
        requireText={answers.business?.tradingName?.trim() || 'CREATE'}
        confirmLabel="Create partner"
        body={
          <>
            Your answers are saved first, and then the partner, its first QR point and its owner’s login are created, in one step. The owner’s temporary password
            is shown once on the next screen. Nothing is created if anything above is wrong.
          </>
        }
        onConfirm={async () => {
          await create();
        }}
      />
    </div>
  );

  // -- local helpers ---------------------------------------------------------

  function set(section: 'business', values: Record<string, unknown>) {
    setAnswers((a) => ({ ...a, [section]: { ...(a[section] ?? {}), ...values } }));
  }
  function setQr(values: Record<string, unknown>) {
    setAnswers((a) => ({ ...a, qrPoint: { ...(a.qrPoint ?? {}), ...values } }));
  }
  function setOwner(values: Record<string, unknown>) {
    setAnswers((a) => ({ ...a, owner: { ...(a.owner ?? {}), ...values } }));
  }
  function setPayout(values: Record<string, unknown>) {
    setAnswers((a) => ({ ...a, payout: { ...(a.payout ?? {}), ...values } }));
  }
}

function validate(step: number, a: OnboardingPayload, hasGstCert: boolean): FieldErrors {
  switch (step) {
    case 0:
      return checkBusiness(a.business ?? {});
    case 1: {
      const e: FieldErrors = {};
      if (a.business?.gstRegistered && !hasGstCert) e['documents.gst_certificate'] = 'Upload the GST certificate';
      return e;
    }
    case 2:
      return a.qrPoint ? checkQrPoint(a.qrPoint) : {};
    case 3:
      return checkOwner(a.owner ?? {});
    case 4:
      return checkPayout(a.payout ?? {});
    default:
      return {};
  }
}

/** The bank and UPI fields the server takes. The saved last four digits are shown, never sent back. */
function payoutFor(p: OnboardingPayload['payout']): OnboardingPayload['payout'] {
  if (!p) return undefined;
  return {
    bankAccountHolder: p.bankAccountHolder,
    bankName: p.bankName,
    bankAccountNumber: p.bankAccountNumber,
    bankIfsc: p.bankIfsc,
    upiId: p.upiId,
  };
}

/** What the bank and UPI details read as on the review: never the account number itself. */
function payoutSummary(p: OnboardingPayload['payout']): string {
  if (!p) return 'Not added. The shop can add it later.';
  const account = p.bankAccountNumber ? `ending ${p.bankAccountNumber.slice(-4)}` : p.bankAccountLast4 ? `ending ${p.bankAccountLast4}` : null;
  const parts = [p.bankName, account, p.upiId].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Not added. The shop can add it later.';
}

function stepHint(step: number): string {
  const hints = [
    'Who the partner is, where it is, and whether it is registered for GST.',
    'The GST certificate is required for a registered business. The signed agreement is kept with the partner.',
    'The first place this partner prints. You can add more later from the partner’s QR points tab.',
    'The person who signs in as the owner of this partner.',
    'Where the shop is paid. Optional now: the shop can add these itself from its own dashboard.',
    'Check everything. Anything wrong is shown here and can be fixed on its step.',
  ];
  return hints[step] ?? '';
}

function Stepper({ current, counts, onPick }: { current: number; counts: number[]; onPick: (s: number) => void }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const issues = counts[i] ?? 0;
        return (
          <li key={s.key} className="min-w-0">
            <button
              type="button"
              onClick={() => onPick(i)}
              disabled={i > current}
              aria-current={active ? 'step' : undefined}
              className={cx(
                'relative flex min-h-[48px] w-full items-center gap-2.5 overflow-hidden rounded-lg border bg-surface px-3 text-left transition',
                active ? 'border-brand-text' : 'border-line hover:border-line-strong',
                i > current && 'cursor-not-allowed opacity-55'
              )}
            >
              <span aria-hidden className={cx('absolute inset-x-0 top-0 h-[3px]', done || active ? 'bg-brand-text' : 'bg-transparent')} />
              <span
                className={cx(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11.5px] font-bold',
                  done ? 'bg-brand text-brand-ink' : active ? 'bg-brand-soft text-brand-text' : 'bg-raised text-mute'
                )}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={cx('min-w-0 flex-1 truncate text-[13px] font-semibold', active || done ? 'text-ink' : 'text-mute')}>{s.label}</span>
              {issues > 0 && <span className="tnum shrink-0 rounded-md bg-bad/10 px-1.5 text-[11px] font-bold text-bad">{issues}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function DocumentSlot({
  title, required, note, docs, kind, disabled, onUpload, onRemove, error,
}: {
  title: string;
  required: boolean;
  note: string;
  docs: { id: string; originalFilename: string; sizeBytes: number }[];
  kind: 'gst_certificate' | 'agreement' | 'other';
  disabled: boolean;
  onUpload: (kind: 'gst_certificate' | 'agreement' | 'other', file: File) => void;
  onRemove: (id: string) => void;
  error?: string;
}) {
  return (
    <div className={cx('rounded-2xl border p-4', required && docs.length === 0 ? 'border-warn/60' : 'border-line')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-ink">
          {title} {required && <span className="text-bad">*</span>}
        </h3>
        {required && docs.length === 0 && <Pill tone="amber">Needed</Pill>}
      </div>
      <p className="mt-1 text-xs text-mute">{note}</p>
      {docs.map((d) => (
        <div key={d.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-raised px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-ink">{d.originalFilename}</span>
          <span className="flex items-center gap-3">
            <span className="text-xs text-mute">{Math.round(d.sizeBytes / 1024)} KB</span>
            <Button size="sm" onClick={() => onRemove(d.id)} disabled={disabled}>Remove</Button>
          </span>
        </div>
      ))}
      {docs.length === 0 && (
        <label className={cx('mt-3 block', disabled && 'opacity-60')}>
          <span className="sr-only">Choose the {title.toLowerCase()} file</span>
          <input
            type="file"
            accept={DOCUMENT_ACCEPT}
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(kind, f);
              e.target.value = '';
            }}
            className="block w-full text-sm text-mute file:mr-3 file:min-h-[44px] file:rounded-full file:border-0 file:bg-brand file:px-4 file:text-brand-ink"
          />
          <span className="mt-1 block text-xs text-mute">PDF, PNG or JPEG, up to 5 MB</span>
        </label>
      )}
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}
    </div>
  );
}

function Review({ problems, conflicts, docs, answers, onEdit, onCreate, busy }: {
  problems: Problem[];
  conflicts: Problem[];
  docs: DocumentView[];
  answers: OnboardingPayload;
  onEdit: (step: number) => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const b = answers.business ?? {};
  const ready = problems.length === 0 && conflicts.length === 0;

  const rows: { label: string; value: string; step: number }[] = [
    { label: 'Trading name', value: b.tradingName ?? '—', step: 0 },
    { label: 'Legal name', value: b.legalName ?? '—', step: 0 },
    { label: 'Type', value: BUSINESS_TYPES.find((t) => t.value === b.businessType)?.label ?? '—', step: 0 },
    { label: 'Address', value: [b.addressLine1, b.addressLine2, b.city, b.state, b.pincode].filter(Boolean).join(', ') || '—', step: 0 },
    { label: 'Contact', value: [b.contactName, b.contactPhone, b.billingEmail].filter(Boolean).join(' · ') || '—', step: 0 },
    { label: 'GST', value: b.gstRegistered ? `Registered · ${b.gstNumber ?? '—'}` : 'Not registered', step: 0 },
    { label: 'Documents', value: docs.map((d) => d.originalFilename).join(', ') || 'None', step: 1 },
    { label: 'Model', value: 'Model 1 · Printer integration', step: 0 },
    { label: 'First QR point', value: answers.qrPoint ? `${answers.qrPoint.code} · ${answers.qrPoint.name}` : 'Not now', step: 2 },
    { label: 'Owner', value: [answers.owner?.fullName, answers.owner?.email].filter(Boolean).join(' · ') || '—', step: 3 },
    { label: 'Bank and UPI', value: payoutSummary(answers.payout), step: 4 },
  ];

  return (
    <div className="space-y-5">
      <dl className="divide-y divide-border/70 rounded-2xl border border-line">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <dt className="text-xs uppercase tracking-wider text-mute">{r.label}</dt>
            <dd className="flex min-w-0 flex-1 items-start justify-end gap-3 text-right text-sm text-ink">
              <span className="min-w-0 break-words">{r.value}</span>
              <button type="button" onClick={() => onEdit(r.step)} className="min-h-[44px] shrink-0 px-1 text-xs text-brand-text underline md:min-h-0">
                Edit
              </button>
            </dd>
          </div>
        ))}
      </dl>

      {problems.length > 0 && (
        <Notice tone="warn">
          <p className="font-medium">Fix these before creating the partner:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {problems.map((p) => (
              <li key={p.field}>
                <button type="button" className="text-left underline" onClick={() => onEdit(stepForField(p.field))}>
                  {p.message}
                </button>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {conflicts.length > 0 && (
        <Notice tone="bad">
          <ul className="list-disc space-y-1 pl-5">
            {conflicts.map((c) => (
              <li key={c.field}>
                <button type="button" className="text-left underline" onClick={() => onEdit(stepForField(c.field))}>
                  {c.message}
                </button>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="flex justify-end">
        <Button variant="primary" onClick={onCreate} disabled={!ready || busy}>
          {busy ? 'Creating…' : 'Create partner'}
        </Button>
      </div>
    </div>
  );
}

/** Shown once, after creation. The temporary password cannot be closed until it is acknowledged. */
function Created({ result, acknowledged, setAcknowledged, copied, copyPassword }: {
  result: OnboardingResult;
  acknowledged: boolean;
  setAcknowledged: (v: boolean) => void;
  copied: boolean;
  copyPassword: (text: string) => void;
}) {
  return (
    <div className="space-y-6">
      <Panel title="Partner created" hint="The owner’s temporary password is below. It is shown only now.">
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-raised p-4">
            <p className="text-xs uppercase tracking-wider text-mute">Owner sign-in</p>
            <p className="mt-1 text-sm text-ink">{result.owner.email}</p>
            <p className="mt-3 text-xs uppercase tracking-wider text-mute">Temporary password</p>
            <p className="mt-1 break-all font-mono text-2xl text-ink">{result.owner.temporaryPassword}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button onClick={() => copyPassword(result.owner.temporaryPassword)}>{copied ? 'Copied' : 'Copy password'}</Button>
            </div>
          </div>

          <Notice tone="warn">
            Give this to the owner now, in person or on a call. It is not stored anywhere readable, and it cannot be shown again.
            If it is lost, reset it from the partner’s Staff tab.
          </Notice>

          <label className="flex items-start gap-3 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            I have saved this password and given it to the owner.
          </label>

          <ul className="list-disc space-y-1 pl-5 text-sm text-mute">
            {result.nextSteps.map((s) => <li key={s}>{s}</li>)}
          </ul>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/partners/new"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-line px-5 text-sm text-ink"
            >
              Set up another partner
            </Link>
            <Link
              href={`/partners/${result.organizationId}/model`}
              aria-disabled={!acknowledged}
              onClick={(e) => { if (!acknowledged) e.preventDefault(); }}
              className={cx(
                'inline-flex min-h-[44px] items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-brand-ink',
                !acknowledged && 'pointer-events-none opacity-50'
              )}
            >
              Open the partner
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** The documents held for a partner. Each download is recorded in the audit trail. */
export function PartnerDocumentsPanel({ orgId, timezone }: { orgId: string; timezone?: string }) {
  const docs = useResource<{ documents: Array<{ id: string; kind: string; originalFilename: string; sizeBytes: number; uploadedAt: string }> }>(
    `organizations/${seg(orgId)}/documents`
  );

  const label: Record<string, string> = {
    gst_certificate: 'GST certificate',
    agreement: 'Agreement',
    other: 'Other document',
  };

  return (
    <Panel title="Documents" hint="Kept with the partner. Downloading one is recorded in the audit trail.">
      {docs.error && <Notice tone="bad">{docs.error}</Notice>}
      {!docs.data && !docs.error && <Loading />}
      {docs.data && docs.data.documents.length === 0 && (
        <p className="text-sm text-mute">No documents on file for this partner.</p>
      )}
      {docs.data && docs.data.documents.length > 0 && (
        <ul className="divide-y divide-border/70 rounded-2xl border border-line">
          {docs.data.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{label[d.kind] ?? d.kind}</p>
                <p className="truncate text-xs text-mute">
                  {d.originalFilename} · {Math.round(d.sizeBytes / 1024)} KB · added {dateTime(d.uploadedAt, timezone)}
                </p>
              </div>
              <a
                href={`/api/proxy/organizations/${seg(orgId)}/documents/${seg(d.id)}/download`}
                className="inline-flex min-h-[44px] items-center rounded-full border border-line px-4 text-sm text-ink"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
