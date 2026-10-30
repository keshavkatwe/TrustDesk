import { Navigate } from 'react-router';
import { RouteNotFound } from '@/components/route-not-found';
import { LoadError, LoadingWorkspace } from '@/components/workspace-states';
import { useWorkspace } from '@/hooks/use-workspace';
import { paths } from '@/routes/paths';

export function WorkspacePage() {
  const workspace = useWorkspace();
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
  const firstTenant = workspace.data.tenants[0];
  return firstTenant ? (
    <Navigate to={paths.inbox(firstTenant.id)} replace />
  ) : (
    <main className="grid min-h-svh place-items-center p-6">
      <RouteNotFound
        title="No businesses available"
        description="There are no businesses in this workspace yet."
      />
    </main>
  );
}
