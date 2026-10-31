import { createHash, randomUUID } from 'node:crypto';
import { aiRuns, messages, type TenantTransaction } from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';
import { type LockedDraft, lockEnquiryDraft } from '../inbox/locks.ts';
import { loadPricingContext } from '../pricing/context.ts';
import type { PricingContext } from '../pricing/evaluate.ts';
import { failure } from '../result.ts';
import { PROMPT_VERSION, type ProviderInput } from './model.ts';
import { buildPrompt } from './prompt.ts';
import type { DraftingFailure } from './result.ts';
import { expireRunningAttempts, findActiveRun } from './runs.ts';

export type DraftAttempt = {
  runId: string;
  target: LockedDraft;
  pricing: PricingContext;
  history: Pick<typeof messages.$inferSelect, 'id' | 'body' | 'receivedAt' | 'sourceEvent'>[];
  input: ProviderInput;
};

export async function claimAttempt(
  tx: TenantTransaction,
  tenantId: string,
  id: string,
  revision: number,
  model: string,
): Promise<{ ok: true; attempt: DraftAttempt } | DraftingFailure> {
  const target = await lockEnquiryDraft(tx, tenantId, id);
  if (!target) return failure('not_found', 'Draft not found in this business.');
  if (!target.isCurrent || target.draft.revision !== revision)
    return failure('conflict', 'This draft changed or was already reviewed. Refresh the inbox.');

  await expireRunningAttempts(tx, tenantId, target.message.id);
  if (await findActiveRun(tx, tenantId, target.message.id))
    return failure('conflict', 'An AI draft is already being generated for this message.');

  const catalogue = await tx.query.catalogueVersions.findFirst({
    columns: { version: true },
    where: (catalogue, { eq }) => eq(catalogue.tenantId, tenantId),
    orderBy: (catalogue, { desc }) => [desc(catalogue.createdAt), desc(catalogue.version)],
  });
  if (!catalogue) throw new Error('Missing business catalogue.');
  const pricing = await loadPricingContext(tx, tenantId, catalogue.version);
  const history = await tx.query.messages.findMany({
    columns: { id: true, body: true, receivedAt: true, sourceEvent: true },
    where: (message, { and, eq }) =>
      and(eq(message.tenantId, tenantId), eq(message.conversationId, target.conversation.id)),
    orderBy: (message, { asc }) => asc(message.sequence),
  });
  const input = buildPrompt(pricing, history);
  if (history.length > 20 || input.user.length > 32000)
    return failure(
      'invalid_request',
      'This conversation exceeds the current drafting limit. Hand it off for review.',
    );

  const runId = randomUUID();
  await tx.insert(aiRuns).values({
    tenantId,
    id: runId,
    messageId: target.message.id,
    sourceDraftId: id,
    sourceRevision: target.draft.revision,
    model,
    promptVersion: PROMPT_VERSION,
    status: 'running',
    inputHash: createHash('sha256').update(input.system).update(input.user).digest('hex'),
  });
  if (target.message.processingState !== 'ready')
    await tx
      .update(messages)
      .set({ processingState: 'processing' })
      .where(and(eq(messages.tenantId, tenantId), eq(messages.id, target.message.id)));
  return { ok: true, attempt: { target, pricing, history, input, runId } };
}
