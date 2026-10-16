import { StaffDetailView } from '@/components/views/staff';

export default async function PersonPage({ params }: { params: Promise<{ orgId: string; userId: string }> }) {
  const resolved = await params;
  return <StaffDetailView orgId={resolved.orgId} userId={resolved.userId} />;
}
