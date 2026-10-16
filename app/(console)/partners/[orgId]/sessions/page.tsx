import { SessionsView } from '@/components/views/money';

export default async function PartnerSessionsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <SessionsView orgId={resolved.orgId} title="Sessions" />;
}
