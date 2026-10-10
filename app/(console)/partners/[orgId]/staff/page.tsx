import { StaffListView } from '@/components/views/staff';

export default function PartnerStaffPage({ params }: { params: { orgId: string } }) {
  return <StaffListView orgId={params.orgId} />;
}
