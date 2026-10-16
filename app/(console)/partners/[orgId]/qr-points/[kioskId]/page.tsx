import { KioskDetailView } from '@/components/views/fleet';

export default async function QrPointPage({ params }: { params: Promise<{ orgId: string; kioskId: string }> }) {
  const resolved = await params;
  return <KioskDetailView orgId={resolved.orgId} kioskId={resolved.kioskId} />;
}
