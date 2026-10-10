import { MoneyView } from '@/components/views/money';

export default function PartnerMoneyPage({ params }: { params: { orgId: string } }) {
  return <MoneyView orgId={params.orgId} />;
}
