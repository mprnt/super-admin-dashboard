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
        meta={<span>Nothing is saved while you work. Choose Save draft to keep your answers, or create the partner to save everything at once.</span>}
      />
      <Suspense fallback={<Loading label="Opening the form" />}>
        <NewPartnerWizard />
      </Suspense>
    </div>
  );
}
