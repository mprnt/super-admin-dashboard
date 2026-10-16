import { PartnerOverviewView } from '@/components/views/partner';

export default async function PartnerOverviewPage({ params }: { params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <PartnerOverviewView orgId={resolved.orgId} />;
}
