import { PartnerFrame } from '@/components/views/partner';

export default async function PartnerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ orgId: string }> }) {
  const resolved = await params;
  return <PartnerFrame orgId={resolved.orgId}>{children}</PartnerFrame>;
}
