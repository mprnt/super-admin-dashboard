import { Suspense } from 'react';
import { LoginForm } from '@/components/console/LoginForm';
import { MprntLogo } from '@/components/MprntLogo';

export default function LoginPage() {
  return (
    <main className="flex min-h-[100dvh] flex-col">
      <section className="safe-bottom flex flex-col justify-end rounded-b-[36px] bg-brand px-6 pb-14 pt-[max(env(safe-area-inset-top),3.5rem)] text-brand-ink md:px-12 md:pb-14">
        <div className="mx-auto w-full max-w-md">
          <MprntLogo variant="full" className="mb-8 h-24 w-auto text-brand-ink" />
          <h1 className="mt-1 text-[34px] font-semibold leading-[1.1] tracking-tight md:text-4xl">Platform console</h1>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-brand-ink/80">Partners, printers and money, in one place. For platform operators only.</p>
        </div>
      </section>

      <section className="flex flex-1 items-start justify-center px-5 pb-10 pt-8 md:items-center md:pt-0">
        <div className="w-full max-w-md">
          <Suspense fallback={<div className="h-72" />}>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-center text-xs leading-relaxed text-mute">
            Shop accounts sign in to the shop dashboard. Sign-in attempts, and every change made here, are recorded.
          </p>
        </div>
      </section>
    </main>
  );
}
