import { QrPointsView } from '@/components/views/fleet';

export default function PartnerQrPointsPage({ params }: { params: { orgId: string } }) {
  return <QrPointsView orgId={params.orgId} />;
}
