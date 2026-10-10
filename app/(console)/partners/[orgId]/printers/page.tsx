import { PrintersView } from '@/components/views/fleet';

export default function PartnerPrintersPage({ params }: { params: { orgId: string } }) {
  return <PrintersView orgId={params.orgId} />;
}
