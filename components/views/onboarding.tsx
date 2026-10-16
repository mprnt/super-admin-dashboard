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
  checkQrPoint,
  checkTerms,
  stepForField,
} from '../../lib/onboarding';
import type { OnboardingDraft, OnboardingPayload, OnboardingResult } from '../../lib/types';
import { useToast } from '../ui/data';
import { ConfirmDialog } from '../ui/dialogs';
import { Button, Field, Input, Loading, Notice, Panel, Pill, Select, Textarea, cx } from '../ui/primitives';

const MODELS = [
  {
    value: 'integration',
    label: 'Model 1 · Printer integration',
    available: true,
    partner: 'Uses its own printer, and pays for the integration kit and a monthly software fee.',
    mprnt: 'Integration, software, payments and support. Keeps 100% of printing revenue.',
  },
  {
    value: 'revenue-share',
    label: 'Model 2 · Option A · Revenue share',
    available: true,
    partner: 'Hosts an MPRNT station and shares printing revenue.',
    mprnt: 'Installs, runs and maintains the station, and keeps its agreed share of revenue.',
  },
  {
    value: 'own-station',
    label: 'Model 2 · Option B · Own station',
    available: false,
    partner: 'Buys a station and pays monthly software.',
    mprnt: 'Coming later. Terms are not set up yet.',
  },
  {
    value: 'full-purchase',
    label: 'Model 3 · Full purchase',
    available: false,
    partner: 'Buys a station outright.',
    mprnt: 'Coming later. Terms are not set up yet.',
  },
] as const;

const inputClass = 'min-h-[44px] md:min-h-0';
const selectClass = 'w-full rounded-2xl border border-line bg-bg px-2.5 py-2 text-base text-ink focus:border-brand-text focus:outline-none md:text-sm';

/** The new-partner wizard. The draft is saved on the server as the operator works. */
export function NewPartnerWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();

  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [answers, setAnswers] = useState<OnboardingPayload>({});
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ tone: 'warn' | 'bad'; text: string; restart?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  // Open the draft named in the URL, or start a new one and name it in the URL,
  // so a refresh or a shared link comes back to the same work.
  useEffect(() => {
    let cancelled = false;
    async function open() {
      const id = params.get('draft');
      try {
        if (id) {
          const d = await call<OnboardingDraft>('GET', `onboarding/drafts/${id}`);
          if (!cancelled) adopt(d);
        } else {
          await startNew();
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
          setNotice({ tone: 'warn', text: 'This draft is no longer available. Start a new partner.', restart: true });
        } else {
          setNotice({ tone: 'bad', text: messageOf(err) });
        }
      }
    }
    void open();
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

  async function startNew() {
    const d = await call<OnboardingDraft>('POST', 'onboarding/drafts');
    router.replace(`/partners/new?draft=${d.id}`);
    adopt(d);
    setNotice(null);
    setStep(0);
    setResult(null);
  }

  /** Saves part of the draft. A stale version is refused, and the operator is told to reload. */
  async function save(patch: OnboardingPayload): Promise<boolean> {
    if (!draft) return false;
    setBusy(true);
    try {
      const d = await call<OnboardingDraft>('PUT', `onboarding/drafts/${draft.id}`, { version: draft.version, patch });
      adopt(d);
      setNotice(null);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        setNotice({ tone: 'bad', text: 'This draft was changed in another window. Reload the page to continue from the latest save.' });
      } else if (err instanceof ApiError && err.status === 410) {
        setNotice({ tone: 'warn', text: 'This draft expired. Start a new partner.', restart: true });
      } else {
        setNotice({ tone: 'bad', text: messageOf(err) });
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Checks the step's own answers, then saves them and moves on. */
  async function next() {
    const found = validate(step, answers, draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const saved = await save(sectionFor(step, answers));
    if (saved) {
      setErrors({});
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }

  async function back() {
    // Going back keeps what was typed, so nothing is lost when someone checks an earlier answer.
    await save(sectionFor(step, answers));
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  async function uploadDocument(kind: 'gst_certificate' | 'agreement' | 'other', file: File) {
    if (!draft) return;
    const problem = checkDocumentFile(file);
    if (problem) {
      setNotice({ tone: 'bad', text: problem });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('kind', kind);
      form.append('document', file, file.name);
      await upload(`onboarding/drafts/${draft.id}/documents`, form);
      adopt(await call<OnboardingDraft>('GET', `onboarding/drafts/${draft.id}`));
      setNotice(null);
    } catch (err) {
      setNotice({ tone: 'bad', text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(docId: string) {
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

  async function create() {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await call<OnboardingResult>('POST', `onboarding/drafts/${draft.id}/complete`);
      setResult(r);
      setConfirming(false);
    } catch (err) {
      setConfirming(false);
      if (err instanceof ApiError && err.status === 409 && err.code === 'DRAFT_COMPLETED') {
        setNotice({ tone: 'warn', text: 'This partner was already created from this draft.', restart: true });
      } else {
        setNotice({ tone: 'bad', text: messageOf(err) });
        // The review shows what the server still needs; refresh it.
        adopt(await call<OnboardingDraft>('GET', `onboarding/drafts/${draft.id}`).catch(() => draft));
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

  if (!draft) {
    return notice ? (
      <div className="space-y-4">
        <Notice tone={notice.tone}>{notice.text}</Notice>
        {notice.restart && <Button variant="primary" onClick={() => void startNew()}>Start a new partner</Button>}
      </div>
    ) : (
      <Loading label="Opening the form" />
    );
  }

  const b = answers.business ?? {};
  const docs = draft.documents;
  const hasGstCert = docs.some((d) => d.kind === 'gst_certificate');
  const readOnly = draft.status !== 'open';

  return (
    <div className="space-y-6">
      <Stepper current={step} problems={draft.problems} onPick={(s) => { if (s <= step) setStep(s); }} />

      {notice && (
        <div className="space-y-3">
          <Notice tone={notice.tone}>{notice.text}</Notice>
          {notice.restart && <Button variant="primary" onClick={() => void startNew()}>Start a new partner</Button>}
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
          <div className="grid gap-3 md:grid-cols-2">
            {MODELS.map((m) => {
              const chosen = answers.model?.businessModel === m.value;
              return (
                <label
                  key={m.value}
                  className={cx(
                    'flex gap-3 rounded-2xl border p-4',
                    m.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                    chosen ? 'border-brand-text bg-brand-soft/40' : 'border-line'
                  )}
                >
                  <input
                    type="radio"
                    name="model"
                    className="mt-1"
                    disabled={!m.available || readOnly}
                    checked={chosen}
                    onChange={() => setAnswers((a) => ({ ...a, model: { businessModel: m.value } }))}
                  />
                  <span className="space-y-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      {m.label}
                      {!m.available && <Pill tone="muted">Coming later</Pill>}
                    </span>
                    <span className="block text-xs text-mute">Partner: {m.partner}</span>
                    <span className="block text-xs text-mute">MPRNT: {m.mprnt}</span>
                  </span>
                </label>
              );
            })}
            {errors['model.businessModel'] && <p className="text-xs text-bad md:col-span-2">{errors['model.businessModel']}</p>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {answers.model?.businessModel === 'revenue-share' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Partner’s share of printing revenue (%)" hint="MPRNT keeps the rest." error={errors.partnerSharePct}>
                  <Input
                    className={inputClass}
                    inputMode="decimal"
                    value={answers.terms?.partnerSharePct ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAnswers((a) => ({ ...a, terms: { ...(a.terms ?? {}), partnerSharePct: v === '' ? null : Number(v) } }));
                    }}
                  />
                </Field>
                <Field label="Starts on (optional)" hint="Blank means from the day it is saved.">
                  <Input className={inputClass} type="date" value={answers.terms?.startsOn ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, terms: { ...(a.terms ?? {}), startsOn: e.target.value || null } }))} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="What was agreed" hint="Written into the split history. Say what was agreed and by whom." error={errors.note}>
                    <Textarea value={answers.terms?.note ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, terms: { ...(a.terms ?? {}), note: e.target.value } }))} />
                  </Field>
                </div>
              </div>
            ) : (
              <Notice tone="info">
                Model 1 prices and the hardware sale are recorded on the partner’s Billing tab after it is created. Nothing is needed here.
              </Notice>
            )}
          </div>
        )}

        {step === 4 && (
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
              </div>
            )}
          </div>
        )}

        {step === 5 && (
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

        {step === 6 && (
          <Review draft={draft} answers={answers} onEdit={setStep} onCreate={() => setConfirming(true)} busy={busy} />
        )}
      </Panel>

      {step < 6 && (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button onClick={() => void back()} disabled={step === 0 || busy}>Back</Button>
          <Button variant="primary" onClick={() => void next()} disabled={busy || readOnly}>
            {busy ? 'Saving…' : 'Save and continue'}
          </Button>
        </div>
      )}
      {step === 6 && (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button onClick={() => void back()} disabled={busy}>Back</Button>
        </div>
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
            This creates the partner, its first QR point and its owner’s login, in one step. The owner’s temporary password
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
}

function validate(step: number, a: OnboardingPayload, draft: OnboardingDraft | null): FieldErrors {
  switch (step) {
    case 0:
      return checkBusiness(a.business ?? {});
    case 1: {
      const e: FieldErrors = {};
      const hasCert = (draft?.documents ?? []).some((d) => d.kind === 'gst_certificate');
      if (a.business?.gstRegistered && !hasCert) e['documents.gst_certificate'] = 'Upload the GST certificate';
      return e;
    }
    case 2:
      return a.model?.businessModel === 'integration' || a.model?.businessModel === 'revenue-share'
        ? {}
        : { 'model.businessModel': 'Choose a model to continue' };
    case 3:
      return a.model?.businessModel === 'revenue-share' ? checkTerms(a.terms ?? {}) : {};
    case 4:
      return a.qrPoint ? checkQrPoint(a.qrPoint) : {};
    case 5:
      return checkOwner(a.owner ?? {});
    default:
      return {};
  }
}

/** The part of the answers that belongs to one step, as the server expects it. */
function sectionFor(step: number, a: OnboardingPayload): OnboardingPayload {
  switch (step) {
    case 0: return { business: a.business };
    case 2: return { model: a.model };
    case 3: return { terms: a.terms };
    case 4: return { qrPoint: a.qrPoint ?? null };
    case 5: return { owner: a.owner };
    default: return {};
  }
}

/** "Partner 35% · MPRNT 65%" for a revenue share; a note for Model 1, where the terms are set on the Billing tab. */
function revenueTerms(a: OnboardingPayload): string {
  if (a.model?.businessModel !== 'revenue-share') return 'Set on the Billing tab after creation';
  const share = a.terms?.partnerSharePct;
  if (share === undefined || share === null) return '—';
  const mprnt = Math.round((100 - Number(share)) * 100) / 100;
  return `Partner ${share}% · MPRNT ${mprnt}%`;
}

function stepHint(step: number): string {
  const hints = [
    'Who the partner is, where it is, and whether it is registered for GST.',
    'The GST certificate is required for a registered business. The signed agreement is kept with the partner.',
    'Choose the commercial model. The options open here are the ones available for onboarding now.',
    'The terms for the chosen model. Model 1 terms are recorded on the Billing tab after creation.',
    'The first place this partner prints. You can add more later from the partner’s QR points tab.',
    'The person who signs in as the owner of this partner.',
    'Check everything. Anything wrong is shown here and can be fixed on its step.',
  ];
  return hints[step] ?? '';
}

function Stepper({ current, problems, onPick }: { current: number; problems: { field: string }[]; onPick: (s: number) => void }) {
  const counts = STEPS.map((_, i) => problems.filter((p) => stepForField(p.field) === i).length);
  return (
    <ol className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const issues = counts[i] ?? 0;
        return (
          <li key={s.key} className="shrink-0">
            <button
              type="button"
              onClick={() => onPick(i)}
              disabled={i > current}
              aria-current={active ? 'step' : undefined}
              className={cx(
                'flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-sm',
                active ? 'border-brand-text bg-brand text-brand-ink' : done ? 'border-line text-ink' : 'border-line text-mute',
                i > current && 'opacity-60'
              )}
            >
              <span className="font-mono text-xs">{i + 1}</span>
              {s.label}
              {issues > 0 && <span className="rounded-full bg-bad/15 px-1.5 text-xs text-bad">{issues}</span>}
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

function Review({ draft, answers, onEdit, onCreate, busy }: {
  draft: OnboardingDraft;
  answers: OnboardingPayload;
  onEdit: (step: number) => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const b = answers.business ?? {};
  const model = MODELS.find((m) => m.value === answers.model?.businessModel);
  const ready = draft.problems.length === 0 && draft.conflicts.length === 0;

  const rows: { label: string; value: string; step: number }[] = [
    { label: 'Trading name', value: b.tradingName ?? '—', step: 0 },
    { label: 'Legal name', value: b.legalName ?? '—', step: 0 },
    { label: 'Type', value: BUSINESS_TYPES.find((t) => t.value === b.businessType)?.label ?? '—', step: 0 },
    { label: 'Address', value: [b.addressLine1, b.addressLine2, b.city, b.state, b.pincode].filter(Boolean).join(', ') || '—', step: 0 },
    { label: 'Contact', value: [b.contactName, b.contactPhone, b.billingEmail].filter(Boolean).join(' · ') || '—', step: 0 },
    { label: 'GST', value: b.gstRegistered ? `Registered · ${b.gstNumber ?? '—'}` : 'Not registered', step: 0 },
    { label: 'Documents', value: draft.documents.map((d) => d.originalFilename).join(', ') || 'None', step: 1 },
    { label: 'Model', value: model?.label ?? '—', step: 2 },
    { label: 'Terms', value: revenueTerms(answers), step: 3 },
    { label: 'First QR point', value: answers.qrPoint ? `${answers.qrPoint.code} · ${answers.qrPoint.name}` : 'Not now', step: 4 },
    { label: 'Owner', value: [answers.owner?.fullName, answers.owner?.email].filter(Boolean).join(' · ') || '—', step: 5 },
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

      {draft.problems.length > 0 && (
        <Notice tone="warn">
          <p className="font-medium">Fix these before creating the partner:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {draft.problems.map((p) => (
              <li key={p.field}>
                <button type="button" className="text-left underline" onClick={() => onEdit(stepForField(p.field))}>
                  {p.message}
                </button>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {draft.conflicts.length > 0 && (
        <Notice tone="bad">
          <ul className="list-disc space-y-1 pl-5">
            {draft.conflicts.map((c) => (
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
