import { useQuery } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { getQualityOverviewOptions } from '@/api/@tanstack/react-query.gen';
import { AttemptsTable } from '@/components/quality/attempts-table';
import { QualityMetrics } from '@/components/quality/quality-metrics';
import { ReviewSummary } from '@/components/quality/review-summary';
import { AgentConfiguration, TrustReadiness } from '@/components/quality/trust-readiness';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkspaceHeader } from '@/components/workspace-header';
import { LoadError, LoadingWorkspace } from '@/components/workspace-states';
import { formatTimestamp } from '@/libs/date';
import type { Tenant } from '@/types/api';
import { AttemptDetails } from './attempt-details';

export function QualityWorkspace({ tenant }: { tenant: Tenant }) {
  const query = useQuery({
    ...getQualityOverviewOptions({ path: { tenantId: tenant.id } }),
    retry: false,
    refetchInterval: 5000,
  });
  const [filter, setFilter] = useState('all');
  const [runId, setRunId] = useState<string | null>(null);
  return (
    <>
      <WorkspaceHeader
        title="Quality & Trust"
        description={`${tenant.shortName} · Evidence and agent readiness`}
      >
        <Badge variant="warning">Supervised</Badge>
        <Button
          variant="outline"
          size="sm"
          aria-label="Refresh quality evidence"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCwIcon data-icon="inline-start" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </WorkspaceHeader>
      <div id="quality" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        {query.isPending ? (
          <LoadingWorkspace />
        ) : query.isError ? (
          <LoadError onRetry={() => void query.refetch()} />
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <p className="font-medium">Recent operational evidence</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Up to {query.data.attemptLimit} recent AI attempts for this business. These are
                workflow outcomes, not evaluation scores.
              </p>
            </div>
            <QualityMetrics summary={query.data.summary} />
            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex min-w-0 flex-col gap-5">
                <AttemptsTable
                  attempts={query.data.attempts}
                  filter={filter}
                  onFilterChange={setFilter}
                  onInspect={setRunId}
                  timezone={tenant.timezone}
                />
                <ReviewSummary reviews={query.data.summary.reviews} />
              </div>
              <div className="flex min-w-0 flex-col gap-5">
                <TrustReadiness configuration={query.data.configuration} />
                <AgentConfiguration configuration={query.data.configuration} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Updated {formatTimestamp(query.data.updatedAt, tenant.timezone)} · {tenant.timezone}
            </p>
          </div>
        )}
      </div>
      <AttemptDetails runId={runId} tenant={tenant} onClose={() => setRunId(null)} />
    </>
  );
}
