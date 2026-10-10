import { PartnerFrame } from '@/components/views/partner';

export default function PartnerLayout({ children, params }: { children: React.ReactNode; params: { orgId: string } }) {
  return <PartnerFrame orgId={params.orgId}>{children}</PartnerFrame>;
}
