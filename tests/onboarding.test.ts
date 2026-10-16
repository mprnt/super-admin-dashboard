import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBusiness,
  checkDocumentFile,
  checkGstin,
  checkOwner,
  checkQrPoint,
  checkTerms,
  gstCheckCharacter,
  INDIAN_STATES,
  GST_STATE_CODES,
  stepForField,
} from '../lib/onboarding.ts';

const GST_MH = '27AAPFU0939F1ZV';

test('the GSTIN check character matches the published examples', () => {
  assert.equal(gstCheckCharacter('27AAPFU0939F1Z'), 'V');
  assert.equal(gstCheckCharacter('07AAGFF2194N1Z'), '1');
});

test('a GSTIN is checked for shape and check character, and reports the state and PAN', () => {
  assert.deepEqual(checkGstin(GST_MH), { ok: true, stateCode: '27', pan: 'AAPFU0939F' });
  assert.equal(checkGstin(GST_MH.slice(0, 14) + 'W').ok, false);
  assert.equal(checkGstin('27AAPFU0939F1Z').ok, false);
});

test('every state has a GST code, and the state list matches the codes', () => {
  for (const s of INDIAN_STATES) assert.match(GST_STATE_CODES[s] ?? '', /^\d{2}$/);
  assert.equal(Object.keys(GST_STATE_CODES).length, INDIAN_STATES.length);
});

test('the business step asks for everything, and the GST question is never skipped', () => {
  const empty = checkBusiness({});
  for (const k of ['tradingName', 'legalName', 'businessType', 'addressLine1', 'city', 'state', 'pincode', 'contactName', 'contactPhone', 'billingEmail', 'gstRegistered']) {
    assert.ok(empty[k], `${k} should be required`);
  }
});

test('a registered business needs a GSTIN for its own state, and a PAN that agrees', () => {
  const base = { tradingName: 'A', legalName: 'A Ltd', businessType: 'stationery', addressLine1: '1', city: 'Pune', state: 'Maharashtra', pincode: '411001', contactName: 'C', contactPhone: '9876543210', billingEmail: 'a@b.test' };
  assert.deepEqual(checkBusiness({ ...base, gstRegistered: true, gstNumber: GST_MH }), {});
  assert.match(checkBusiness({ ...base, state: 'Delhi', gstRegistered: true, gstNumber: GST_MH }).gstNumber ?? '', /another state/);
  assert.match(checkBusiness({ ...base, gstRegistered: true, gstNumber: GST_MH, pan: 'ABCDE1234F' }).pan ?? '', /does not match/);
  assert.ok(checkBusiness({ ...base, gstRegistered: true, gstNumber: '' }).gstNumber);
});

test('the pincode, mobile and email are checked on the line they are typed', () => {
  const base = { tradingName: 'A', legalName: 'A', businessType: 'stationery', addressLine1: '1', city: 'Pune', state: 'Maharashtra', contactName: 'C', gstRegistered: false };
  const bad = checkBusiness({ ...base, pincode: '052001', contactPhone: '12345', billingEmail: 'nope' });
  assert.ok(bad.pincode && bad.contactPhone && bad.billingEmail);
});

test('the revenue share needs a percentage and a note of what was agreed', () => {
  assert.ok(checkTerms({ partnerSharePct: 150, note: 'ok note' }).partnerSharePct);
  assert.ok(checkTerms({ partnerSharePct: 35, note: '' }).note);
  assert.deepEqual(checkTerms({ partnerSharePct: 35, note: 'Agreed on the call' }), {});
});

test('the owner needs a name and an email; a QR point needs a code, name and location', () => {
  assert.ok(checkOwner({ fullName: '', email: '' }).email);
  assert.deepEqual(checkOwner({ fullName: 'Owner', email: 'o@x.test' }), {});
  assert.ok(checkQrPoint({ code: 'bad code!', name: '', location: '' }).code);
});

test('a document is checked for size and type before it is sent', () => {
  assert.equal(checkDocumentFile({ size: 1000, type: 'application/pdf' }), null);
  assert.match(checkDocumentFile({ size: 6 * 1024 * 1024, type: 'application/pdf' }) ?? '', /5 MB/);
  assert.match(checkDocumentFile({ size: 1000, type: 'text/html' }) ?? '', /PDF, PNG or JPEG/);
});

test('a server problem is sent back to the step that holds it', () => {
  assert.equal(stepForField('business.gstNumber'), 0);
  assert.equal(stepForField('documents.gst_certificate'), 1);
  assert.equal(stepForField('model.businessModel'), 2);
  assert.equal(stepForField('terms.note'), 3);
  assert.equal(stepForField('qrPoint.code'), 4);
  assert.equal(stepForField('owner.email'), 5);
  assert.equal(stepForField('something.else'), 6);
});
