import { PrinterDetailView } from '@/components/views/fleet';

export default function PrinterPage({ params }: { params: { orgId: string; printerId: string } }) {
  return <PrinterDetailView orgId={params.orgId} printerId={decodeURIComponent(params.printerId)} />;
}
