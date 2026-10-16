import { PricingView } from '@/components/views/money';

export default async function PartnerPricingPage({ params }: { params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <PricingView orgId={resolved.orgId} />;
}
