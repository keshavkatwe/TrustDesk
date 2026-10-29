import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getDemoWorkspaceOptions } from '@/api/@tanstack/react-query.gen';
import { AppSidebar } from '@/components/app-sidebar';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { InboxWorkspace } from '@/features/inbox/inbox-workspace';
import { LoadError, LoadingWorkspace } from '@/features/inbox/states';
import type { Tenant } from '@/features/inbox/types';

export function App() {
  const workspace = useQuery({ ...getDemoWorkspaceOptions(), retry: false });
  const [tenantId, setTenantId] = useState<Tenant['id']>('qamar');
  const tenant = workspace.data?.tenants.find((entry) => entry.id === tenantId);
  if (workspace.isError)
    return (
      <main className="mx-auto max-w-xl p-8">
        <LoadError onRetry={() => void workspace.refetch()} />
      </main>
    );
  if (!tenant || !workspace.data)
    return (
      <main className="p-8">
        <LoadingWorkspace />
      </main>
    );
  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh overflow-hidden">
        <Button asChild variant="outline" className="sr-only focus:not-sr-only focus:absolute">
          <a href="#inbox">Skip to inbox</a>
        </Button>
        <AppSidebar tenants={workspace.data.tenants} tenant={tenant} onTenantChange={setTenantId} />
        <SidebarInset className="min-w-0">
          <InboxWorkspace key={tenant.id} tenant={tenant} />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
