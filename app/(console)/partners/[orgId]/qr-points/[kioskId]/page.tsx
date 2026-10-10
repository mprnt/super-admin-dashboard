import { KioskDetailView } from '@/components/views/fleet';

export default function QrPointPage({ params }: { params: { orgId: string; kioskId: string } }) {
  return <KioskDetailView orgId={params.orgId} kioskId={params.kioskId} />;
}
