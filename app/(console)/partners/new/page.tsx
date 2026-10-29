import { Suspense } from 'react';
import { NewPartnerWizard } from '@/components/views/onboarding';
import { PageHeader } from '@/components/ui/data';
import { Loading } from '@/components/ui/primitives';

export default function NewPartnerPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: 'Partners', href: '/partners' }, { label: 'New partner' }]}
        title="Onboard a Model 1 partner"
        meta={<span>Your answers are saved as you go, and nothing is created until you confirm the review.</span>}
      />
      <Suspense fallback={<Loading label="Opening the form" />}>
        <NewPartnerWizard />
      </Suspense>
    </div>
  );
}
