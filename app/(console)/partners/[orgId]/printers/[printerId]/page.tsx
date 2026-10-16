import { PrinterDetailView } from '@/components/views/fleet';

export default async function PrinterPage({ params }: { params: Promise<{ orgId: string; printerId: string }> }) {
  const resolved = await params;
  return <PrinterDetailView orgId={resolved.orgId} printerId={decodeURIComponent(resolved.printerId)} />;
}
