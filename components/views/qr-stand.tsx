'use client';

import { useEffect, useMemo, useState } from 'react';
import { customerAppBase, customerAppUrl, qrSvg, standFileName, standSvg } from '../../lib/qr-stand';
import { Button, Notice } from '../ui/primitives';

/** 8 × 12 in at 300 dpi, which is the size a stand is printed at. */
const PRINT_SIZE = { width: 2400, height: 3600 } as const;

/**
 * The stand for one QR point, made as the operator types the code. Nothing is saved
 * here: the stand is a file to print, and the QR it carries is the code on the form.
 */
export function QrStandPreview({ code, partner }: { code: string; partner: string }) {
  const base = customerAppBase();
  const [made, setMade] = useState<{ code: string; svg: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    setFailed(false);
    qrSvg(customerAppUrl(base, code))
      .then((svg) => {
        if (!cancelled) setMade({ code, svg });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [base, code]);

  // The QR is only ever shown for the code on the form, never for an earlier one.
  const qr = made?.code === code ? made.svg : null;
  const preview = useMemo(
    () => (qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(standSvg(qr))}` : null),
    [qr]
  );

  if (!base) {
    return (
      <Notice tone="bad">
        The customer app address is not set, so the QR code cannot be made. Set NEXT_PUBLIC_CUSTOMER_APP_URL and restart the console.
      </Notice>
    );
  }

  async function download(kind: 'png' | 'svg') {
    if (!qr) return;
    const name = standFileName(partner, code);
    setProblem(null);
    if (kind === 'svg') {
      save(new Blob([standSvg(qr)], { type: 'image/svg+xml' }), `${name}.svg`);
      return;
    }
    setBusy(true);
    try {
      save(await pngBlob(standSvg(qr, PRINT_SIZE), PRINT_SIZE), `${name}.png`);
    } catch {
      setProblem('The PNG could not be made in this browser. Download the SVG instead; it prints at any size.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-start">
      <div className="mx-auto w-[220px] md:mx-0">
        {preview ? (
          // A data URL, which next/image does not serve, so a plain img is right here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`Stand for QR point ${code}`} className="w-full rounded-2xl border border-line shadow-card" />
        ) : (
          <div aria-hidden className="aspect-[2/3] w-full rounded-2xl border border-line bg-raised" />
        )}
      </div>
      <div className="space-y-3">
        {failed && <Notice tone="bad">The QR code could not be made for {code}. Check the code and try again.</Notice>}
        <p className="text-sm text-ink">
          This is the stand for <span className="font-mono">{code}</span>. Its QR code opens this QR point, and nothing else on the artwork changes.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => void download('png')} disabled={!qr || busy}>
            {busy ? 'Making PNG…' : 'Download PNG for print'}
          </Button>
          <Button onClick={() => void download('svg')} disabled={!qr}>
            Download SVG
          </Button>
        </div>
        <p className="text-xs text-mute">
          The PNG is 2400 × 3600 px, which is 8 × 12 in at 300 dpi. The SVG is vector and prints at any size.
        </p>
        {problem && <Notice tone="bad">{problem}</Notice>}
      </div>
    </div>
  );
}

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Let the browser start the download before the address is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Draws the SVG onto a canvas at the print size, so the PNG is sharp at that size. */
async function pngBlob(svg: string, size: { width: number; height: number }): Promise<Blob> {
  const source = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = source;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    ctx.drawImage(img, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG failed'))), 'image/png')
    );
  } finally {
    URL.revokeObjectURL(source);
  }
}
