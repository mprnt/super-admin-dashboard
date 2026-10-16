import { PartnerModelView } from '@/components/views/partner';

export default async function PartnerModelPage({ params }: { params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <PartnerModelView orgId={resolved.orgId} />;
}
