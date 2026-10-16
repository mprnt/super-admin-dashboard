import { AttentionView } from '@/components/views/money';

export default async function PartnerAttentionPage({ params }: { params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <AttentionView orgId={resolved.orgId} />;
}
