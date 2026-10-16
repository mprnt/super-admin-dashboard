import { PrintersView } from '@/components/views/fleet';

export default async function PartnerPrintersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <PrintersView orgId={resolved.orgId} />;
}
