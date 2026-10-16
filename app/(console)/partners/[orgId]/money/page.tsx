import { MoneyView } from '@/components/views/money';

export default async function PartnerMoneyPage({ params }: { params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <MoneyView orgId={resolved.orgId} />;
}
