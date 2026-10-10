import { StaffDetailView } from '@/components/views/staff';

export default function PersonPage({ params }: { params: { orgId: string; userId: string } }) {
  return <StaffDetailView orgId={params.orgId} userId={params.userId} />;
}
