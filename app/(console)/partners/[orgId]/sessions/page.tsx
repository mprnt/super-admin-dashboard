import { SessionsView } from '@/components/views/money';

export default function PartnerSessionsPage({ params }: { params: { orgId: string } }) {
  return <SessionsView orgId={params.orgId} title="Sessions" />;
}
