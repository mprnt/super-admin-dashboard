/**
 * The onboarding wizard's rules, as the browser checks them. The server makes the
 * same checks when a draft is saved and completed, and is the authority; these
 * exist so a mistake is caught on the line it was made, not at the end.
 */

export const BUSINESS_TYPES = [
  { value: 'stationery', label: 'Stationery shop' },
  { value: 'cyber_cafe', label: 'Cyber café' },
  { value: 'photocopy', label: 'Photocopy & print shop' },
  { value: 'college', label: 'College' },
  { value: 'library', label: 'Library' },
  { value: 'office', label: 'Office' },
  { value: 'other', label: 'Other' },
] as const;

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const;

/** The two-digit GST code at the front of a GSTIN, per state. Same table as the server. */
export const GST_STATE_CODES: Record<string, string> = {
  'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', 'Punjab': '03', 'Chandigarh': '04',
  'Uttarakhand': '05', 'Haryana': '06', 'Delhi': '07', 'Rajasthan': '08', 'Uttar Pradesh': '09',
  'Bihar': '10', 'Sikkim': '11', 'Arunachal Pradesh': '12', 'Nagaland': '13', 'Manipur': '14',
  'Mizoram': '15', 'Tripura': '16', 'Meghalaya': '17', 'Assam': '18', 'West Bengal': '19',
  'Jharkhand': '20', 'Odisha': '21', 'Chhattisgarh': '22', 'Madhya Pradesh': '23', 'Gujarat': '24',
  'Dadra and Nagar Haveli and Daman and Diu': '26', 'Maharashtra': '27', 'Karnataka': '29',
  'Goa': '30', 'Lakshadweep': '31', 'Kerala': '32', 'Tamil Nadu': '33', 'Puducherry': '34',
  'Andaman and Nicobar Islands': '35', 'Telangana': '36', 'Andhra Pradesh': '37', 'Ladakh': '38',
};

const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The GSTIN check character, as the GST system computes it. */
export function gstCheckCharacter(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GST_CHARS.indexOf(first14.charAt(i));
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GST_CHARS.charAt((36 - (sum % 36)) % 36);
}

export function checkGstin(gstin: string): { ok: true; stateCode: string; pan: string } | { ok: false; reason: string } {
  if (!GSTIN_SHAPE.test(gstin)) {
    return { ok: false, reason: 'A GST number is 15 characters, for example 27AAPFU0939F1ZV' };
  }
  if (gstCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, reason: 'This GST number does not check out. Re-read it from the certificate' };
  }
  return { ok: true, stateCode: gstin.slice(0, 2), pan: gstin.slice(2, 12) };
}

export const isPan = (v: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
export const isPincode = (v: string) => /^[1-9][0-9]{5}$/.test(v);
export const isMobile = (v: string) => /^(\+91[ -]?)?[6-9][0-9]{9}$/.test(v.replace(/\s+/g, ''));
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** The wizard's steps, in order. `fields` is what each step can name in a problem. */
export const STEPS = [
  { key: 'business', label: 'Business' },
  { key: 'documents', label: 'Documents' },
  { key: 'model', label: 'Model' },
  { key: 'terms', label: 'Terms' },
  { key: 'qr', label: 'QR point' },
  { key: 'owner', label: 'Owner' },
  { key: 'review', label: 'Review' },
] as const;

/** Which step a server problem belongs to, so the review can send you back to fix it. */
export function stepForField(field: string): number {
  if (field.startsWith('business.')) return 0;
  if (field.startsWith('documents.')) return 1;
  if (field.startsWith('model.')) return 2;
  if (field.startsWith('terms.')) return 3;
  if (field.startsWith('qrPoint.')) return 4;
  if (field.startsWith('owner.')) return 5;
  return 6;
}

export type FieldErrors = Record<string, string>;

/** Client-side checks for one step's answers. Empty object = the step can be saved. */
export function checkBusiness(b: {
  tradingName?: string; legalName?: string; businessType?: string; addressLine1?: string;
  city?: string; state?: string; pincode?: string; contactName?: string; contactPhone?: string;
  billingEmail?: string; gstRegistered?: boolean | null; gstNumber?: string | null; pan?: string | null;
}): FieldErrors {
  const e: FieldErrors = {};
  const need = (k: string, v: unknown) => { if (!v || (typeof v === 'string' && !v.trim())) e[k] = 'Required'; };
  need('tradingName', b.tradingName);
  need('legalName', b.legalName);
  need('businessType', b.businessType);
  need('addressLine1', b.addressLine1);
  need('city', b.city);
  need('state', b.state);
  need('pincode', b.pincode);
  need('contactName', b.contactName);
  need('contactPhone', b.contactPhone);
  need('billingEmail', b.billingEmail);
  if (b.pincode && !isPincode(b.pincode)) e.pincode = 'Six digits, and the first is not 0';
  if (b.contactPhone && !isMobile(b.contactPhone)) e.contactPhone = 'Enter a 10-digit mobile number';
  if (b.billingEmail && !isEmail(b.billingEmail)) e.billingEmail = 'Enter a valid email';
  if (b.gstRegistered === undefined || b.gstRegistered === null) {
    e.gstRegistered = 'Say whether the business is GST-registered';
  } else if (b.gstRegistered) {
    if (!b.gstNumber) e.gstNumber = 'A GST-registered business needs its GST number';
    else {
      const check = checkGstin(b.gstNumber.toUpperCase());
      if (!check.ok) e.gstNumber = check.reason;
      else if (b.state && GST_STATE_CODES[b.state] !== check.stateCode) {
        e.gstNumber = `This number is for another state. ${b.state} starts with ${GST_STATE_CODES[b.state] ?? '—'}`;
      }
      if (b.pan && check.ok && b.pan.toUpperCase() !== check.pan) e.pan = 'The PAN does not match the GST number';
    }
  }
  if (b.pan && !isPan(b.pan.toUpperCase())) e.pan = 'A PAN is five letters, four digits, then a letter';
  return e;
}

export function checkTerms(t: { partnerSharePct?: number | null; note?: string }): FieldErrors {
  const e: FieldErrors = {};
  if (t.partnerSharePct === undefined || t.partnerSharePct === null) e.partnerSharePct = 'Set the partner’s share';
  else if (t.partnerSharePct < 0 || t.partnerSharePct > 100) e.partnerSharePct = 'Between 0 and 100';
  if (!t.note || t.note.trim().length < 3) e.note = 'Write down what was agreed (at least 3 characters)';
  return e;
}

export function checkOwner(o: { fullName?: string; email?: string; phone?: string | null }): FieldErrors {
  const e: FieldErrors = {};
  if (!o.fullName?.trim()) e.fullName = 'Required';
  if (!o.email?.trim()) e.email = 'The owner needs an email to sign in';
  else if (!isEmail(o.email)) e.email = 'Enter a valid email';
  if (o.phone && !isMobile(o.phone)) e.phone = 'Enter a 10-digit mobile number';
  return e;
}

export function checkQrPoint(q: { code?: string; name?: string; location?: string }): FieldErrors {
  const e: FieldErrors = {};
  if (!q.code || !/^[A-Za-z0-9-]{2,10}$/.test(q.code)) e.code = '2 to 10 letters, digits or hyphens';
  if (!q.name?.trim()) e.name = 'Required';
  if (!q.location?.trim()) e.location = 'Required';
  return e;
}

/** Upload checks the browser can make; the server checks the file's real bytes. */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_ACCEPT = 'application/pdf,image/png,image/jpeg';

export function checkDocumentFile(file: { size: number; type: string }): string | null {
  if (file.size > DOCUMENT_MAX_BYTES) return 'A document can be at most 5 MB';
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) return 'Only PDF, PNG or JPEG files';
  return null;
}
