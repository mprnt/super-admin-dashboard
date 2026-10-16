import { AuditView } from '@/components/views/ops';

export default async function PartnerAuditPage({ params }: { params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <AuditView orgId={resolved.orgId} />;
}
