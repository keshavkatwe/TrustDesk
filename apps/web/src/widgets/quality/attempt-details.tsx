import { useQuery } from '@tanstack/react-query';
import { getQualityAttemptOptions } from '@/api/@tanstack/react-query.gen';
import { QuoteBreakdown } from '@/components/inbox/quote-breakdown';
import { AttemptStatus } from '@/components/quality/attempt-status';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadError, LoadingWorkspace } from '@/components/workspace-states';
import { formatTimestamp } from '@/libs/date';
import { formatAiCost, formatDuration } from '@/libs/quality';
import type { Tenant } from '@/types/api';

export function AttemptDetails({
  runId,
  tenant,
  onClose,
}: {
  runId: string | null;
  tenant: Tenant;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={runId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>AI attempt details</DialogTitle>
          <DialogDescription>
            Saved evidence for {tenant.shortName}. Inspecting does not call the model.
          </DialogDescription>
        </DialogHeader>
        {runId && <AttemptEvidence key={runId} runId={runId} tenant={tenant} />}
      </DialogContent>
    </Dialog>
  );
}

function AttemptEvidence({ runId, tenant }: { runId: string; tenant: Tenant }) {
  const query = useQuery({
    ...getQualityAttemptOptions({ path: { tenantId: tenant.id, runId } }),
    retry: false,
  });
  if (query.isPending) return <LoadingWorkspace />;
  if (query.isError) return <LoadError onRetry={() => void query.refetch()} />;
  const attempt = query.data;
  const metadata = [
    ['Model', attempt.model],
    ['Prompt', attempt.promptVersion],
    ['Started', formatTimestamp(attempt.createdAt, tenant.timezone)],
    ['Duration', formatDuration(attempt.durationMs)],
    ['Estimated cost', formatAiCost(attempt.usage?.estimatedCostUsd)],
    [
      'Tokens',
      attempt.usage
        ? `${attempt.usage.inputTokens} input · ${attempt.usage.outputTokens} output`
        : 'Unknown',
    ],
  ];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <AttemptStatus status={attempt.status} />
        {attempt.review && (
          <Badge variant="outline">
            {attempt.review.action === 'approve'
              ? 'Approved'
              : attempt.review.action === 'reject'
                ? 'Rejected'
                : 'Handed off'}{' '}
            by {attempt.review.reviewer}
          </Badge>
        )}
      </div>
      <h2 className="font-semibold">{attempt.title}</h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {metadata.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-words text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {attempt.errorCode && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Attempt did not produce a current draft</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{attempt.errorCode.replaceAll('_', ' ')}. The previous draft was preserved.</p>
          </CardContent>
        </Card>
      )}
      <Card size="sm">
        <CardHeader>
          <CardTitle>Customer message</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap" dir="auto">
            {attempt.body}
          </p>
          <p className="mt-2 break-all text-xs text-muted-foreground">
            {attempt.customer} · {attempt.sourceEvent}
          </p>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Prepared reply</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap" dir="auto">
            {attempt.reply ??
              'This attempt has no saved reply. Earlier drafts are not attributed to it.'}
          </p>
        </CardContent>
      </Card>
      {attempt.assessment?.quote && (
        <QuoteBreakdown quote={attempt.assessment.quote} assessment={attempt.assessment} />
      )}
      <dl className="flex flex-col gap-2 text-xs text-muted-foreground">
        <div>
          <dt>Attempt ID</dt>
          <dd className="break-all">{attempt.id}</dd>
        </div>
        <div>
          <dt>Provider response</dt>
          <dd className="break-all">{attempt.responseId ?? 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Input fingerprint</dt>
          <dd className="break-all">{attempt.inputHash}</dd>
        </div>
      </dl>
    </div>
  );
}
