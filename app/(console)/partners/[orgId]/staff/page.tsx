import { StaffListView } from '@/components/views/staff';

export default async function PartnerStaffPage({ params }: { params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <StaffListView orgId={resolved.orgId} />;
}
