import { PricingView } from '@/components/views/money';

export default function PartnerPricingPage({ params }: { params: { orgId: string } }) {
  return <PricingView orgId={params.orgId} />;
}
