import { AttentionView } from '@/components/views/money';

export default function PartnerAttentionPage({ params }: { params: { orgId: string } }) {
  return <AttentionView orgId={params.orgId} />;
}
