import { aiRuns, drafts, messages, type TenantTransaction } from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';
import type {
  CompletionMetadata,
  DraftAttempt,
  PreparedAttempt,
  PreparedDraft,
  RejectedDraft,
} from './rules.ts';
import { failProcessingMessage } from './runs.ts';

export function loadConversationHistory(
  tx: TenantTransaction,
  tenantId: string,
  conversationId: string,
) {
  return tx.query.messages.findMany({
    columns: { id: true, body: true, receivedAt: true, sourceEvent: true },
    where: (message, { and, eq }) =>
      and(eq(message.tenantId, tenantId), eq(message.conversationId, conversationId)),
    orderBy: (message, { asc }) => asc(message.sequence),
    // One extra record proves the 20-message limit was exceeded without loading unbounded history.
    limit: 21,
  });
}

export async function saveAttempt(tx: TenantTransaction, plan: PreparedAttempt) {
  await tx.insert(aiRuns).values(plan.run);
  const { message } = plan.attempt.target;
  if (message.processingState !== 'ready')
    await tx
      .update(messages)
      .set({ processingState: 'processing' })
      .where(and(eq(messages.tenantId, plan.run.tenantId), eq(messages.id, message.id)));
}

export async function lockAttempt(tx: TenantTransaction, tenantId: string, runId: string) {
  const [run] = await tx
    .select()
    .from(aiRuns)
    .where(and(eq(aiRuns.tenantId, tenantId), eq(aiRuns.id, runId)))
    .for('update');
  if (!run) throw new Error('Draft run missing.');
  return run;
}

export function saveLateCompletion(
  tx: TenantTransaction,
  tenantId: string,
  runId: string,
  metadata: CompletionMetadata,
) {
  // Late responses retain usage but cannot revive an expired attempt.
  return tx
    .update(aiRuns)
    .set(metadata)
    .where(and(eq(aiRuns.tenantId, tenantId), eq(aiRuns.id, runId)));
}

export async function saveRejectedDraft(
  tx: TenantTransaction,
  tenantId: string,
  claim: DraftAttempt,
  metadata: CompletionMetadata,
  rejection: RejectedDraft,
) {
  await failProcessingMessage(tx, tenantId, claim.target.message.id);
  await tx
    .update(aiRuns)
    .set({ ...metadata, status: rejection.status, errorCode: rejection.errorCode })
    .where(and(eq(aiRuns.tenantId, tenantId), eq(aiRuns.id, claim.runId)));
}

export async function savePreparedDraft(
  tx: TenantTransaction,
  tenantId: string,
  claim: DraftAttempt,
  metadata: CompletionMetadata,
  prepared: PreparedDraft,
) {
  await tx.insert(drafts).values(prepared.draft);
  await tx
    .update(drafts)
    .set(prepared.sourceChanges)
    .where(and(eq(drafts.tenantId, tenantId), eq(drafts.id, claim.target.draft.id)));
  await tx
    .update(aiRuns)
    .set({ ...metadata, status: 'succeeded', resultDraftId: prepared.draft.id })
    .where(and(eq(aiRuns.tenantId, tenantId), eq(aiRuns.id, claim.runId)));
  await tx
    .update(messages)
    .set({ processingState: 'ready' })
    .where(and(eq(messages.tenantId, tenantId), eq(messages.id, prepared.draft.messageId)));
}
