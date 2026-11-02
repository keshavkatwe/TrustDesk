import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon, LoaderCircleIcon } from 'lucide-react';
import { useState } from 'react';
import {
  getEvaluationRunOptions,
  getEvaluationsOptions,
  labelEvaluationMutation,
  promoteTrustMutation,
} from '@/api/@tanstack/react-query.gen';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { LoadError, LoadingWorkspace } from '@/components/workspace-states';
import { formatTimestamp } from '@/libs/date';
import { formatAiCost, formatDuration } from '@/libs/quality';
import type { EvaluationRun, Tenant } from '@/types/api';

const dimensions = ['intent_fidelity', 'language', 'helpfulness'] as const;
const names = {
  intent_fidelity: 'Intent fidelity',
  language: 'Language',
  helpfulness: 'Helpfulness',
};
type Grade = 'pass' | 'fail' | 'not_assessable';

export function Evaluations({ tenant }: { tenant: Tenant }) {
  const query = useQuery({
    ...getEvaluationsOptions({ path: { tenantId: tenant.id } }),
    retry: false,
    refetchInterval: 5000,
  });
  const [runId, setRunId] = useState('');
  const [inspectedRunId, setInspectedRunId] = useState<string | null>(null);
  if (query.isPending) return <LoadingWorkspace />;
  if (query.isError) return <LoadError onRetry={() => void query.refetch()} />;
  const evidence = query.data;
  const selected =
    evidence.runs.find((run) => run.id === runId) ??
    evidence.runs.find(
      (run) =>
        run.accepted &&
        run.agent.id === evidence.currentAgentId &&
        run.contextHash === evidence.currentContextHash,
    ) ??
    evidence.runs[0];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Evaluations & trust</CardTitle>
          <Badge variant={evidence.trust.level === 'autonomous' ? 'success' : 'warning'}>
            {evidence.trust.level === 'autonomous' ? 'Autonomous' : 'Supervised'}
          </Badge>
        </div>
        <CardDescription>{evidence.trust.reason}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {evidence.trust.level === 'autonomous' && (
          <Alert role="status">
            <CircleCheckIcon />
            <AlertTitle>Promotion recorded for {tenant.shortName}</AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
              <p>
                {tenant.autoSend === 'off'
                  ? 'Automatic sending remains disabled for this business.'
                  : 'Eligible English FAQ replies can now proceed automatically.'}{' '}
                Firm quotes still require human approval.
              </p>
              {evidence.trust.by && evidence.trust.at && (
                <p>
                  Promoted by {evidence.trust.by} ·{' '}
                  {formatTimestamp(evidence.trust.at, tenant.timezone)}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
        {selected ? (
          <>
            <Field>
              <FieldLabel htmlFor="evaluation-run">Saved run</FieldLabel>
              <Select value={selected.id} onValueChange={setRunId}>
                <SelectTrigger id="evaluation-run" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {evidence.runs.map((run) => (
                      <SelectItem key={run.id} value={run.id}>
                        {run.variant === 'degraded'
                          ? 'Degraded candidate'
                          : run.accepted
                            ? 'Accepted baseline'
                            : 'Candidate'}{' '}
                        · {run.gate.passedCases}/{run.gate.total} ·{' '}
                        {formatTimestamp(run.createdAt, tenant.timezone)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Badge variant={selected.gate.passed ? 'success' : 'destructive'}>
                Gate {selected.gate.passed ? 'passed' : 'blocked'}
              </Badge>
              <Badge variant="outline">
                {selected.gate.passedCases}/{selected.gate.total} passed
              </Badge>
              <Badge variant="outline">
                Arabic {selected.gate.arabicPassed}/{selected.gate.arabicTotal}
              </Badge>
              <Badge variant="outline">{selected.gate.hardFailures} hard failures</Badge>
              <Badge variant="outline">
                {selected.agent.id === evidence.currentAgentId &&
                selected.contextHash === evidence.currentContextHash
                  ? 'Current configuration'
                  : 'Historical configuration'}
              </Badge>
            </div>
            {selected.gate.reasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {selected.gate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={() => setInspectedRunId(selected.id)}>
                Inspect cases & label outputs
              </Button>
              <span className="text-xs text-muted-foreground">
                Saved real model responses · no model call when viewing
              </span>
            </div>
            <p className="break-all font-mono text-xs text-muted-foreground">
              Agent {selected.agent.id} · {selected.suiteVersion} · {selected.agent.model}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No stored evaluation runs. Run the evaluation command to collect real evidence.
          </p>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">
            Trust decision history ({evidence.ledger.length})
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {evidence.ledger.length ? (
              evidence.ledger.map((event) => (
                <div key={event.id}>
                  <p>
                    {event.level === 'autonomous' ? 'Promoted' : 'Supervised'} ·{' '}
                    {event.by ?? 'Automatic gate'} · {formatTimestamp(event.at, tenant.timezone)}
                  </p>
                  <p className="text-muted-foreground">{event.reason}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {event.agentId.slice(0, 16)}
                  </p>
                </div>
              ))
            ) : (
              <p>No promotion has been recorded.</p>
            )}
          </div>
        </details>
      </CardContent>
      <Dialog
        open={inspectedRunId !== null}
        onOpenChange={(open) => {
          if (!open) setInspectedRunId(null);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Evaluation evidence & human calibration</DialogTitle>
            <DialogDescription>
              Grade the actual output independently before revealing the judge. Five labelled
              outputs per business are required before promotion.
            </DialogDescription>
          </DialogHeader>
          {inspectedRunId && (
            <RunEvidence
              key={inspectedRunId}
              tenant={tenant}
              runId={inspectedRunId}
              promoted={evidence.trust.level === 'autonomous'}
              onPromoted={() => setInspectedRunId(null)}
              current={
                evidence.runs.find((run) => run.id === inspectedRunId)?.agent.id ===
                  evidence.currentAgentId &&
                evidence.runs.find((run) => run.id === inspectedRunId)?.contextHash ===
                  evidence.currentContextHash
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RunEvidence({
  tenant,
  runId,
  current,
  promoted,
  onPromoted,
}: {
  tenant: Tenant;
  runId: string;
  current: boolean;
  promoted: boolean;
  onPromoted: () => void;
}) {
  const query = useQuery({
    ...getEvaluationRunOptions({ path: { tenantId: tenant.id, runId } }),
    retry: false,
  });
  const [caseId, setCaseId] = useState('');
  if (query.isPending) return <LoadingWorkspace />;
  if (query.isError) return <LoadError onRetry={() => void query.refetch()} />;
  const run = query.data,
    result =
      run.report.results.find((result) => result.case.id === caseId) ?? run.report.results[0];
  if (!result) return <p>No completed cases.</p>;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {current && promoted && (
        <Alert role="status">
          <CircleCheckIcon />
          <AlertTitle>This version is already promoted</AlertTitle>
          <AlertDescription>
            The promotion is saved for {tenant.shortName}. You can close this dialog; firm quotes
            still require human approval.
          </AlertDescription>
        </Alert>
      )}
      <p className="text-sm">
        Human labels: {run.calibration.labels}/5 · Agreement:{' '}
        {run.calibration.comparisons
          ? `${run.calibration.agreements}/${run.calibration.comparisons} dimensions`
          : 'not measured'}{' '}
        · {run.calibration.ready ? 'Calibration ready' : 'Calibration required'}
      </p>
      {run.calibration.disagreements.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {run.calibration.disagreements.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <Field>
        <FieldLabel htmlFor="evaluation-case">Case</FieldLabel>
        <Select value={result.case.id} onValueChange={setCaseId}>
          <SelectTrigger id="evaluation-case" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {run.report.results.map((item) => (
                <SelectItem key={item.case.id} value={item.case.id}>
                  {item.case.id} · {item.case.category} · {item.case.language}
                  {run.labels.some((label) => label.caseId === item.case.id) ? ' · Labelled' : ''}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <CaseEvidence
        key={result.case.id}
        tenant={tenant}
        run={run}
        result={result}
        onSaved={() => void query.refetch()}
      />
      {current &&
        !promoted &&
        run.report.accepted &&
        run.report.gate.passed &&
        run.calibration.ready && (
          <Promotion tenant={tenant} runId={runId} onPromoted={onPromoted} />
        )}
    </div>
  );
}

function CaseEvidence({
  tenant,
  run,
  result,
  onSaved,
}: {
  tenant: Tenant;
  run: EvaluationRun;
  result: EvaluationRun['report']['results'][number];
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const mutation = useMutation({
    ...labelEvaluationMutation(),
    onSuccess: () => {
      onSaved();
      void client.invalidateQueries();
    },
  });
  const [reviewer, setReviewer] = useState(''),
    [reason, setReason] = useState('');
  const [grades, setGrades] = useState<Partial<Record<(typeof dimensions)[number], Grade>>>({});
  const [revealed, setRevealed] = useState(false);
  const label = run.labels.find((label) => label.caseId === result.case.id);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Customer messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.case.messages.map((message) => (
            <p key={message} dir="auto" className="whitespace-pre-wrap text-sm leading-7">
              {message}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">
            Expected properties: {result.case.guidance}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Prepared reply</CardTitle>
        </CardHeader>
        <CardContent>
          <p dir="auto" className="whitespace-pre-wrap text-sm leading-7">
            {result.reply ?? `Generation failed: ${result.error ?? 'no valid output'}`}
          </p>
        </CardContent>
      </Card>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">
          Structured interpretation & code checks
        </summary>
        <pre dir="ltr" className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(result.output, null, 2)}
        </pre>
        <ul className="mt-3 space-y-1">
          {result.checks.map((check) => (
            <li
              key={check.name}
              className={check.pass ? 'text-muted-foreground' : 'text-destructive'}
            >
              {check.pass ? 'Pass' : 'Fail'} · {check.name}
              {check.hard ? ' · hard' : ''}
            </li>
          ))}
        </ul>
      </details>
      {label ? (
        <p className="text-sm">
          Human label saved by {label.approverName}:{' '}
          {dimensions.map((key) => `${names[key]} ${label.dimensions[key]}`).join(' · ')}.{' '}
          {label.rationale}
        </p>
      ) : !revealed ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!grades.intent_fidelity || !grades.language || !grades.helpfulness) return;
            mutation.mutate({
              path: { tenantId: tenant.id, runId: run.report.id },
              body: {
                caseId: result.case.id,
                approverId: reviewer,
                dimensions: {
                  intent_fidelity: grades.intent_fidelity,
                  language: grades.language,
                  helpfulness: grades.helpfulness,
                },
                rationale: reason,
              },
            });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="human-reviewer">Human reviewer</FieldLabel>
              <Select value={reviewer} onValueChange={setReviewer}>
                <SelectTrigger id="human-reviewer" className="w-full">
                  <SelectValue placeholder="Choose reviewer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {tenant.approvers.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              {dimensions.map((key) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`grade-${key}`}>{names[key]}</FieldLabel>
                  <Select
                    value={grades[key] ?? ''}
                    onValueChange={(value) => setGrades({ ...grades, [key]: value as Grade })}
                  >
                    <SelectTrigger id={`grade-${key}`} className="w-full">
                      <SelectValue placeholder="Choose grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="pass">Pass</SelectItem>
                        <SelectItem value="fail">Fail</SelectItem>
                        <SelectItem value="not_assessable">Not assessable</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ))}
            </div>
            <Field>
              <FieldLabel htmlFor="human-rationale">Your reasoning</FieldLabel>
              <Textarea
                id="human-rationale"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
                required
              />
            </Field>
          </FieldGroup>
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message ?? 'Could not save label.'}
            </p>
          )}
          <Button
            type="submit"
            disabled={
              mutation.isPending ||
              !reviewer ||
              !reason.trim() ||
              dimensions.some((key) => !grades[key])
            }
          >
            {mutation.isPending ? 'Saving…' : 'Save independent human label'}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          Judge revealed. Use another output for independent calibration.
        </p>
      )}
      {label || revealed ? (
        <Card>
          <CardHeader>
            <CardTitle>Judge assessment</CardTitle>
            <CardDescription>
              Automated judgement can be wrong. Compare it with the actual evidence.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {result.judge ? (
              dimensions.map((key) => (
                <div key={key}>
                  <Badge variant={result.judge?.[key].grade === 'pass' ? 'success' : 'warning'}>
                    {names[key]} · {result.judge?.[key].grade}
                  </Badge>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {result.judge?.[key].rationale}
                  </p>
                </div>
              ))
            ) : (
              <p>Judge unavailable: {result.judging.error}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Button variant="ghost" onClick={() => setRevealed(true)}>
          Inspect judge instead of labelling independently
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Extraction: {formatDuration(result.generation.durationMs)} ·{' '}
        {formatAiCost(result.generation.usage?.estimatedCostUsd)} ·{' '}
        {result.generation.usage
          ? `${result.generation.usage.inputTokens} input / ${result.generation.usage.outputTokens} output tokens`
          : 'usage unavailable'}
        . Judge: {formatDuration(result.judging.durationMs)} ·{' '}
        {formatAiCost(result.judging.usage?.estimatedCostUsd)}.
      </p>
      <p className="break-all font-mono text-xs text-muted-foreground">
        Response {result.generation.responseId ?? 'unavailable'} · Judge{' '}
        {result.judging.responseId ?? 'unavailable'}
      </p>
    </div>
  );
}

function Promotion({
  tenant,
  runId,
  onPromoted,
}: {
  tenant: Tenant;
  runId: string;
  onPromoted: () => void;
}) {
  const client = useQueryClient(),
    mutation = useMutation({
      ...promoteTrustMutation(),
      onSuccess: async () => {
        await client.invalidateQueries();
        onPromoted();
      },
    });
  const [reviewer, setReviewer] = useState(''),
    [reason, setReason] = useState('');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending || mutation.isSuccess) return;
        mutation.mutate({
          path: { tenantId: tenant.id },
          body: { runId, approverId: reviewer, reason },
        });
      }}
    >
      <Separator />
      <p className="font-medium">Named promotion</p>
      <p className="text-sm text-muted-foreground">
        Promotion applies only to this business, agent and configuration. Firm quotes still need
        approval; Rimal auto-send remains off.
      </p>
      <fieldset
        disabled={mutation.isPending || mutation.isSuccess}
        className="flex min-w-0 flex-col gap-3"
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="promotion-reviewer">Promotion reviewer</FieldLabel>
            <Select value={reviewer} onValueChange={setReviewer}>
              <SelectTrigger id="promotion-reviewer">
                <SelectValue placeholder="Choose reviewer" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {tenant.approvers.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="promotion-reason">Promotion reason</FieldLabel>
            <Textarea
              id="promotion-reason"
              placeholder="Reason for promotion"
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
            />
          </Field>
        </FieldGroup>
        <Button disabled={!reviewer || !reason.trim() || mutation.isPending || mutation.isSuccess}>
          {mutation.isPending ? (
            <>
              <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              Promoting…
            </>
          ) : (
            'Promote evaluated version'
          )}
        </Button>
      </fieldset>
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Promotion was not recorded</AlertTitle>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
