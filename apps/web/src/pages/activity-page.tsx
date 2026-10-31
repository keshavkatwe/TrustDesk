import { useCurrentTenant } from '@/hooks/use-workspace';
import { ActivityWorkspace } from '@/widgets/activity/activity-workspace';
export default function ActivityPage() {
  const tenant = useCurrentTenant();
  return <ActivityWorkspace key={tenant.id} tenant={tenant} />;
}
