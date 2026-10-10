import { AuditView } from '@/components/views/ops';

export default function PartnerAuditPage({ params }: { params: { orgId: string } }) {
  return <AuditView orgId={params.orgId} />;
}
