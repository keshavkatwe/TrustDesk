import { useCurrentTenant } from '@/hooks/use-workspace';
import { SettingsWorkspace } from '@/widgets/settings/settings-workspace';
export default function SettingsPage() {
  const tenant = useCurrentTenant();
  return <SettingsWorkspace key={tenant.id} tenant={tenant} />;
}
