import { PartnerModelView } from '@/components/views/partner';

export default function PartnerModelPage({ params }: { params: { orgId: string } }) {
  return <PartnerModelView orgId={params.orgId} />;
}
