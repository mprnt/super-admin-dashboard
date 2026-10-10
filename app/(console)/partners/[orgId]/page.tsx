import { PartnerOverviewView } from '@/components/views/partner';

export default function PartnerOverviewPage({ params }: { params: { orgId: string } }) {
  return <PartnerOverviewView orgId={params.orgId} />;
}
