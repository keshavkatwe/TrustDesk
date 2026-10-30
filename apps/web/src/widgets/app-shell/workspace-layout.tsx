import { Suspense } from 'react';
import { Outlet, useMatch, useNavigate, useParams } from 'react-router';
import { RouteNotFound } from '@/components/route-not-found';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { LoadError, LoadingWorkspace } from '@/components/workspace-states';
import { useWorkspace } from '@/hooks/use-workspace';
import { paths, routePatterns } from '@/routes/paths';
import { AppSidebar } from './app-sidebar';

export function WorkspaceLayout() {
  const { tenantId } = useParams();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const isQuality = useMatch(routePatterns.quality);
  if (workspace.isError)
    return (
      <main className="mx-auto max-w-xl p-8">
        <LoadError onRetry={() => void workspace.refetch()} />
      </main>
    );
  if (workspace.isPending)
    return (
      <main className="p-8">
        <LoadingWorkspace />
      </main>
    );
  const tenant = workspace.data.tenants.find((entry) => entry.id === tenantId);
  if (!tenant)
    return (
      <main className="grid min-h-svh place-items-center p-6">
        <RouteNotFound
          title="Business not found"
          description="This business is not available in the workspace."
        />
      </main>
    );
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Button asChild variant="outline" className="sr-only focus:not-sr-only focus:absolute">
        <a href={isQuality ? '#quality' : '#inbox'}>
          Skip to {isQuality ? 'quality evidence' : 'inbox'}
        </a>
      </Button>
      <AppSidebar
        tenants={workspace.data.tenants}
        tenant={tenant}
        onTenantChange={(id) => void navigate(isQuality ? paths.quality(id) : paths.inbox(id))}
      />
      <SidebarInset className="min-w-0">
        <Suspense
          fallback={
            <div className="p-6">
              <LoadingWorkspace />
            </div>
          }
        >
          <Outlet context={tenant} />
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  );
}
