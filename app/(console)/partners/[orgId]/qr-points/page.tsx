import { QrPointsView } from '@/components/views/fleet';

export default async function PartnerQrPointsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <QrPointsView orgId={resolved.orgId} />;
}
