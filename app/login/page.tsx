import { Suspense } from 'react';
import { LoginForm } from '@/components/console/LoginForm';
import { MprntLogo } from '@/components/MprntLogo';

const POINTS = [
  'Every Model 1 partner, QR point, printer and person',
  'Bank, UPI and rates for each shop, and who set them',
  'Paid jobs that have not printed, before they become refunds',
];

export default function LoginPage() {
  return (
    <main className="grid min-h-[100dvh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-side px-6 pb-8 pt-[max(env(safe-area-inset-top),2rem)] text-side-ink md:px-12 lg:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }}
        />
        <MprntLogo variant="full" className="relative h-16 w-auto self-start text-side-ink lg:h-20" />

        <div className="relative mt-10 max-w-md lg:mt-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Platform console</p>
          <h1 className="mt-3 text-[30px] font-semibold leading-[1.1] tracking-tight md:text-[38px]">Everything about every shop, in one place.</h1>
          <ul className="mt-6 hidden space-y-2.5 lg:block">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-[14px] text-side-ink/85">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-8 hidden text-[12px] text-side-mute lg:block">For MPRNT platform operators only.</p>
      </section>

      <section className="flex items-start justify-center bg-bg px-5 pb-10 pt-8 md:items-center md:pt-0">
        <div className="w-full max-w-[400px]">
          <div className="rounded-xl border border-line bg-surface p-5 md:p-7">
            <h2 className="text-[18px] font-semibold tracking-tight text-ink">Sign in</h2>
            <p className="mb-5 mt-1 text-[13px] text-mute">With your MPRNT platform account.</p>
            <Suspense fallback={<div className="h-72" />}>
              <LoginForm />
            </Suspense>
          </div>
          <p className="mt-5 text-center text-[12px] leading-relaxed text-mute">
            Shop accounts sign in to the shop dashboard. Sign-in attempts, and every change made here, are recorded.
          </p>
        </div>
      </section>
    </main>
  );
}
