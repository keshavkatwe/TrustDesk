import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, CornerUpRightIcon, PencilIcon, ShieldAlertIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { getInboxQueryKey, reviewDraftMutation } from '@/api/@tanstack/react-query.gen';
import type { GetInboxResponse } from '@/api/types.gen';
import { QuoteBreakdown } from '@/components/inbox/quote-breakdown';
import { ReplyDiff } from '@/components/inbox/reply-diff';
import { StatusBadge } from '@/components/inbox/status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { formatTimestamp } from '@/libs/date';
import { statuses } from '@/libs/inbox';
import type { Action, InboxItem, Tenant } from '@/types/api';
import { GenerateDraft } from './generate-draft';

const actionLabels: Record<Action, string> = {
  approve: 'Approve reply',
  reject: 'Reject draft',
  hand_off: 'Hand off',
};

export function ReviewPanel({
  item,
  tenant,
  approverId,
  outsideFilter,
  onBack,
  onSelect,
  onReviewed,
}: {
  item: InboxItem;
  tenant: Tenant;
  approverId: string;
  outsideFilter: boolean;
  onBack: () => void;
  onSelect: (id: string) => void;
  onReviewed: () => void;
}) {
  const [reply, setReply] = useState(item.draftReply);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const queryKey = getInboxQueryKey({ path: { tenantId: tenant.id } });
  const mutation = useMutation({
    ...reviewDraftMutation(),
    onSuccess: async (updated) => {
      await queryClient.cancelQueries({ queryKey });
      onReviewed();
      queryClient.setQueryData<GetInboxResponse>(
        queryKey,
        (current) =>
          current && {
            items: current.items.map((entry) => (entry.id === updated.id ? updated : entry)),
          },
      );
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const reviewer = tenant.approvers.find((person) => person.id === approverId);
  const reviewable = item.status === 'needs_approval';
  const preparing =
    item.provenance === 'received' &&
    (item.processingState === 'queued' || item.processingState === 'processing');
  const approvalBlocked = !item.assessment || item.assessment.blockApproval;
  const changed = reply.trim() !== item.draftReply;
  const validReply = reply.trim().length > 0 && reply.trim().length <= 4000;
  const generation = item.draftGeneration;
  function startReview(next: Action) {
    mutation.reset();
    setReason('');
    setAction(next);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={item.status}
            processingState={item.processingState}
            outboxStatus={item.outbox?.status}
            automatic={item.automatic}
          />
          {item.assessment && <Badge variant="info">Pricing & policy checked</Badge>}
          {item.provenance === 'openai' && <Badge>AI prepared</Badge>}
          <span className="text-xs text-muted-foreground">
            Draft v{item.draftVersion} · Revision {item.revision} · {item.sourceEvent}
          </span>
        </div>
        <h2 className="text-lg font-semibold">{item.title}</h2>
        <p className="break-all text-sm text-muted-foreground">
          <bdi>{item.customer}</bdi> · {item.channel} · {item.language} ·{' '}
          <time dateTime={item.receivedAt}>
            {formatTimestamp(item.receivedAt, tenant.timezone)}
          </time>
        </p>
      </div>
      {outsideFilter && (
        <Alert>
          <AlertTitle>This message is outside the current filter</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Your selection is kept for review.
            <Button variant="outline" size="sm" onClick={onBack}>
              Return to queue
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {item.status === 'superseded' ? (
        <Alert>
          <ShieldAlertIcon />
          <AlertTitle>Replaced by a newer message or draft</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            Open the current draft before taking any action.
            {item.supersededBy && (
              <Button
                variant="outline"
                onClick={() => item.supersededBy && onSelect(item.supersededBy)}
              >
                Open current draft
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        reviewable && (
          <Alert>
            <ShieldAlertIcon />
            <AlertTitle>
              {preparing
                ? 'Preparing a reply'
                : approvalBlocked
                  ? 'Approval blocked by policy'
                  : 'Human review required'}
            </AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {item.reasons.slice(0, 3).map((entry) => (
                  <li key={entry.title}>{entry.title}</li>
                ))}
              </ul>
              {item.reasons.length > 3 && (
                <p>{item.reasons.length - 3} more checks in Review evidence below.</p>
              )}
            </AlertDescription>
          </Alert>
        )
      )}
      {item.automatic && (
        <Alert>
          <CheckIcon />
          <AlertTitle>Authorized low-risk FAQ</AlertTitle>
          <AlertDescription>
            Code selected a configured FAQ after a named human promoted this evaluated agent
            version. Dispatch rechecks current trust and policy. Delivery is simulated.
          </AlertDescription>
        </Alert>
      )}
      {item.decision && (
        <Alert>
          <CheckIcon />
          <AlertTitle>
            Decision saved ·{' '}
            {item.outbox?.status === 'simulated_sent'
              ? 'Sent · simulated'
              : item.outbox?.status === 'cancelled'
                ? 'Send cancelled'
                : statuses[item.status]}
          </AlertTitle>
          <AlertDescription>
            {item.decision.approverName} · {formatTimestamp(item.decision.at, tenant.timezone)}.{' '}
            {item.status === 'approved'
              ? item.outbox?.status === 'simulated_sent'
                ? 'The approved reply was recorded by the local simulator. No real customer was contacted.'
                : item.outbox?.status === 'cancelled'
                  ? 'The simulated send was cancelled.'
                  : 'Waiting for simulated sending by the worker.'
              : 'No customer message was sent.'}
            {item.decision.reason && <p>Reason: {item.decision.reason}</p>}
            {item.outbox && (
              <p className="mt-2 break-all text-xs">
                {item.outbox.status === 'simulated_sent'
                  ? `Simulation ID: ${item.outbox.simulatedMessageId}`
                  : item.outbox.status === 'cancelled'
                    ? item.outbox.reason
                    : `Outbox: ${item.outbox.id}`}
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>Customer message</h3>
          </CardTitle>
          <CardDescription>
            {item.provenance === 'sample' ? 'Seed scenario' : 'Incoming message'} ·{' '}
            {item.sourceEvent}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">
            {item.body}
          </p>
          {item.context.map((entry) => (
            <div key={entry.label} className="flex flex-col gap-2">
              <Separator />
              <p className="text-xs text-muted-foreground">{entry.label}</p>
              <p className="text-sm leading-relaxed" dir="auto">
                {entry.body}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>{item.decision ? 'Reviewed reply' : 'Proposed reply'}</h3>
          </CardTitle>
          <CardDescription>
            {reviewable
              ? item.assessment
                ? item.provenance === 'openai'
                  ? 'AI extracted the request. Code calculated the quote and assembled this reply. Review the interpretation before approval.'
                  : 'Template reply · amounts and rules checked by code. Request extraction is still a sample.'
                : item.provenance === 'received'
                  ? preparing
                    ? 'The message is saved. The background worker is preparing the draft.'
                    : 'Drafting did not complete. Retry generation or hand this enquiry to a person.'
                  : 'Legacy sample · no computed assessment; hand off or regenerate before approval.'
              : 'Read-only · this draft no longer accepts decisions.'}
          </CardDescription>
          {reviewable && !preparing && (
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
                <PencilIcon data-icon="inline-start" />
                {editing ? 'Done editing' : 'Edit reply'}
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {reviewable && !preparing && (
            <div className="mb-4">
              <GenerateDraft item={item} hasUnsavedEdits={changed} onSelect={onSelect} />
            </div>
          )}
          {item.provenance === 'openai' && generation && (
            <p className="mb-4 break-all text-xs text-muted-foreground">
              {generation.model} · {generation.promptVersion}
              {generation.usage && (
                <>
                  {' '}
                  · {generation.usage.inputTokens + generation.usage.outputTokens} tokens ·{' '}
                  {generation.usage.estimatedCostUsd
                    ? `estimated USD ${generation.usage.estimatedCostUsd}`
                    : 'cost unavailable'}
                </>
              )}
            </p>
          )}
          {editing ? (
            <FieldGroup>
              <Field data-invalid={!validReply}>
                <FieldLabel htmlFor="reply">Reply to customer</FieldLabel>
                <Textarea
                  id="reply"
                  value={reply}
                  dir="auto"
                  lang={item.language === 'English' ? 'en' : 'ar'}
                  className="min-h-40"
                  maxLength={4000}
                  aria-invalid={!validReply}
                  onChange={(event) => setReply(event.target.value)}
                />
                <FieldDescription>
                  {!validReply
                    ? 'A reply is required.'
                    : 'Edits are recorded. Commercial numbers require a new calculation.'}{' '}
                  {reply.length}/4,000 characters.
                </FieldDescription>
              </Field>
            </FieldGroup>
          ) : (
            <p
              dir="auto"
              lang={item.language === 'English' ? 'en' : 'ar'}
              className="whitespace-pre-wrap text-sm leading-relaxed"
            >
              {reply}
            </p>
          )}
        </CardContent>
        {reviewable && (
          <CardFooter className="flex-col items-stretch gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!reviewer || !validReply || approvalBlocked}
                onClick={() => startReview('approve')}
              >
                <CheckIcon data-icon="inline-start" />
                Approve reply
              </Button>
              <Button
                variant="destructive"
                disabled={!reviewer || !validReply}
                onClick={() => startReview('reject')}
              >
                <XIcon data-icon="inline-start" />
                Reject
              </Button>
              <Button
                variant="outline"
                disabled={!reviewer || !validReply}
                onClick={() => startReview('hand_off')}
              >
                <CornerUpRightIcon data-icon="inline-start" />
                Hand off
              </Button>
              {changed && <Badge variant="info">Edited</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {!reviewer
                ? 'Choose a named approver above to review this draft.'
                : `Reviewing as ${reviewer.name} · Approval queues this reply for simulated sending.`}
              {approvalBlocked && ' Approval is blocked; reject or hand off this request.'}
              {item.recommendedAction === 'hand_off' && ' Recommended action: hand off.'}
            </p>
          </CardFooter>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>Request details</h3>
          </CardTitle>
          <CardDescription>
            {item.provenance === 'openai'
              ? 'AI interpretation of this message and its conversation. Check it against the customer’s wording.'
              : 'Illustrative extraction from the seed message and conversation.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            {item.extracted.map((entry) => (
              <div key={entry.label}>
                <dt className="text-xs text-muted-foreground">{entry.label}</dt>
                <dd className="mt-1 text-sm">
                  <bdi>{entry.value}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          {item.missing.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Still needed</p>
                <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
                  {item.missing.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {item.quote && <QuoteBreakdown quote={item.quote} assessment={item.assessment} />}
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>Review evidence</h3>
          </CardTitle>
          <CardDescription>
            {item.assessment
              ? `Computed policy reasons · ${item.assessment.engineVersion} · catalogue ${item.assessment.catalogueVersion}`
              : 'Legacy sample references and hand-authored hold reasons.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {item.reasons.map((entry) => (
            <div key={entry.title} className="flex flex-col gap-1">
              <h4 className="text-sm font-medium">{entry.title}</h4>
              <p className="text-sm text-muted-foreground">{entry.detail}</p>
              <p className="text-xs text-muted-foreground">
                <bdi>{entry.source}</bdi>
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
      {item.decision && item.decision.reply !== item.decision.originalReply && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h3>Recorded edit</h3>
            </CardTitle>
            <CardDescription>
              Original and reviewed wording saved with this decision.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReplyDiff before={item.decision.originalReply} after={item.decision.reply} />
          </CardContent>
        </Card>
      )}
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setAction(null);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{action ? actionLabels[action] : 'Review draft'}</DialogTitle>
            <DialogDescription>
              {reviewer?.name} · {tenant.shortName} · revision {item.revision}. This decision will
              be saved to the database.
            </DialogDescription>
          </DialogHeader>
          {changed ? (
            <ReplyDiff before={item.draftReply} after={reply.trim()} />
          ) : (
            <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed">
              {reply}
            </p>
          )}
          {action !== 'approve' && (
            <FieldGroup>
              <Field data-invalid={reason.length > 0 && !reason.trim()}>
                <FieldLabel htmlFor="reason">
                  Reason <span className="text-muted-foreground">(required)</span>
                </FieldLabel>
                <Textarea
                  id="reason"
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    action === 'hand_off'
                      ? 'Who should handle this, and why?'
                      : 'What needs to change?'
                  }
                  aria-invalid={reason.length > 0 && !reason.trim()}
                />
              </Field>
            </FieldGroup>
          )}
          {mutation.isError && (
            <Alert variant="destructive">
              <AlertTitle>Decision wasn’t recorded</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                {mutation.error?.message || 'The API is unavailable. Try again.'}
                <Button
                  variant="outline"
                  onClick={() => void queryClient.invalidateQueries({ queryKey })}
                >
                  Refresh current draft
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              variant={action === 'reject' ? 'destructive' : 'default'}
              disabled={
                mutation.isPending ||
                !reviewer ||
                !validReply ||
                (action === 'approve' && approvalBlocked) ||
                (action !== 'approve' && !reason.trim())
              }
              onClick={() =>
                action &&
                mutation.mutate({
                  path: { tenantId: tenant.id, id: item.id },
                  body: {
                    approverId,
                    revision: item.revision,
                    action,
                    reply: reply.trim(),
                    reason: reason.trim(),
                  },
                })
              }
            >
              {mutation.isPending
                ? 'Recording…'
                : action === 'approve'
                  ? 'Confirm approval'
                  : action
                    ? actionLabels[action]
                    : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
