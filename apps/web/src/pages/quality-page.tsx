import { useCurrentTenant } from '@/hooks/use-workspace';
import { QualityWorkspace } from '@/widgets/quality/quality-workspace';

export default function QualityPage() {
  const tenant = useCurrentTenant();
  return <QualityWorkspace key={tenant.id} tenant={tenant} />;
}
