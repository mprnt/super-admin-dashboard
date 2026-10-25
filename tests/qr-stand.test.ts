import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerAppUrl, qrSvg, slugify, standFileName, standSvg } from '../lib/qr-stand.ts';

test('a QR point encodes the customer app with its code, as the backend script does', () => {
  assert.equal(customerAppUrl('https://mprnt-qr.vercel.app', 'M002'), 'https://mprnt-qr.vercel.app/?kioskId=M002');
  assert.equal(customerAppUrl('https://mprnt-qr.vercel.app', 'a-1'), 'https://mprnt-qr.vercel.app/?kioskId=a-1');
});

test('the file name says which partner and which QR point the stand is for', () => {
  assert.equal(standFileName('Shree Print House', 'm002'), 'mprnt-stand-shree-print-house-m002');
  assert.equal(standFileName('', 'M002'), 'mprnt-stand-partner-m002');
  assert.equal(slugify('  Café & Co.  '), 'caf-co');
});

test('the stand carries the QR for its own code, at the size asked for', async () => {
  const qr = await qrSvg(customerAppUrl('https://mprnt-qr.vercel.app', 'M002'));
  const svg = standSvg(qr, { width: 2400, height: 3600 });

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="2400" height="3600" viewBox="0 0 1200 1800"/);
  // The QR is nested inside the artboard, with its own drawing and viewBox.
  assert.match(svg, /<svg x="340" y="760" width="520" height="520" viewBox="0 0 \d+ \d+"/);
  assert.ok(svg.includes(qr.match(/<path fill="#FFFFFF"/)?.[0] ?? '<none>'));
  assert.doesNotMatch(svg, /<\?xml/);
});

test('the same stand text appears for every code; only the QR changes', async () => {
  const a = standSvg(await qrSvg(customerAppUrl('https://x.test', 'M001')));
  const b = standSvg(await qrSvg(customerAppUrl('https://x.test', 'M002')));
  const strip = (s: string) => s.replace(/<svg x="340"[\s\S]*?<\/svg>/, '');
  assert.notEqual(a, b);
  assert.equal(strip(a), strip(b));
});
