import { Suspense } from 'react';
import { NewPartnerWizard } from '@/components/views/onboarding';
import { Loading } from '@/components/ui/primitives';

export default function NewPartnerPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-mute">Partners</p>
        <h1 className="mt-1 font-serif text-3xl text-ink">New partner</h1>
        <p className="mt-2 max-w-2xl text-sm text-mute">
          Set up a partner in one pass. Your answers are saved as you go, and nothing is created until you confirm the review.
        </p>
      </header>
      <Suspense fallback={<Loading label="Opening the form" />}>
        <NewPartnerWizard />
      </Suspense>
    </div>
  );
}
