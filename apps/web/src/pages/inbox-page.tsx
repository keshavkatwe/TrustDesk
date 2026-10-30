import { useCurrentTenant } from '@/hooks/use-workspace';
import { InboxWorkspace } from '@/widgets/inbox/inbox-workspace';

export default function InboxPage() {
  const tenant = useCurrentTenant();
  return <InboxWorkspace key={tenant.id} tenant={tenant} />;
}
