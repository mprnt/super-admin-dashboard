import { Suspense } from 'react';
import { LoginForm } from '@/components/console/LoginForm';

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded bg-amber font-mono text-sm font-semibold text-[#111]">
            M
          </span>
          <div>
            <h1 className="text-base font-semibold text-ink">Platform console</h1>
            <p className="font-mono text-[11px] uppercase tracking-wider text-amber">Platform operators only</p>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-5 shadow-2xl">
          <Suspense fallback={<div className="h-64" />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-mute">
          Shop accounts sign in to the shop dashboard. Sign-in attempts, and every change made here, are recorded.
        </p>
      </div>
    </main>
  );
}
