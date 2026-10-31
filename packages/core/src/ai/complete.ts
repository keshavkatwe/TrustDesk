import { randomUUID } from 'node:crypto';
import { aiRuns, drafts, messages, type TenantTransaction } from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';
import { lockEnquiryDraft } from '../inbox/locks.ts';
import { DraftEvidence } from '../inbox/model.ts';
import { loadPricingContext } from '../pricing/context.ts';
import { evaluateRequest } from '../pricing/evaluate.ts';
import { renderReply } from '../pricing/render.ts';
import { failure } from '../result.ts';
import type { DraftAttempt } from './claim.ts';
import { buildDraftEvidence } from './evidence.ts';
import type { GeneratedDraft } from './generate.ts';
import type { DraftingFailure, DraftingResult } from './result.ts';
import { failProcessingMessage } from './runs.ts';

export async function completeAttempt(
  tx: TenantTransaction,
  tenantId: string,
  id: string,
  claim: DraftAttempt,
  generated: GeneratedDraft,
  model: string,
): Promise<DraftingResult> {
  const target = await lockEnquiryDraft(tx, tenantId, id);
  const [run] = await tx
    .select()
    .from(aiRuns)
    .where(and(eq(aiRuns.tenantId, tenantId), eq(aiRuns.id, claim.runId)))
    .for('update');
  if (!run) throw new Error('Draft run missing.');
  const { response, output, errorCode } = generated;
  const metadata = {
    responseId: response?.responseId ?? null,
    model: response?.model ?? model,
    usage: response?.usage ?? null,
    output: response ? { text: response.text.slice(0, 16000) } : null,
    durationMs: Math.max(0, Date.now() - generated.startedAt),
    finishedAt: new Date(),
  };
  const runKey = and(eq(aiRuns.tenantId, tenantId), eq(aiRuns.id, claim.runId));
  async function reject(
    status: 'failed' | 'superseded',
    errorCode: string,
    rejection: DraftingFailure,
  ) {
    await failProcessingMessage(tx, tenantId, claim.target.message.id);
    await tx
      .update(aiRuns)
      .set({ ...metadata, status, errorCode })
      .where(runKey);
    return rejection;
  }

  if (run.status !== 'running') {
    // Late completions record usage but cannot revive an expired attempt.
    await tx.update(aiRuns).set(metadata).where(runKey);
    return failure('conflict', 'This AI attempt expired. Refresh the inbox.');
  }
  if (errorCode || !output)
    return reject(
      'failed',
      errorCode ?? 'invalid_output',
      failure(
        'generation_failed',
        'AI could not prepare a valid draft. Your existing draft is unchanged. Try again or hand it off.',
      ),
    );
  if (!target?.isCurrent || target.draft.revision !== claim.target.draft.revision)
    return reject(
      'superseded',
      'stale_draft',
      failure(
        'conflict',
        'The enquiry or review changed during generation. The AI result was not applied.',
      ),
    );

  const assessment = evaluateRequest(claim.pricing, output.request);
  const currentPricing = await loadPricingContext(tx, tenantId, claim.pricing.catalogue.version);
  if (evaluateRequest(currentPricing, output.request).fingerprint !== assessment.fingerprint)
    return reject(
      'superseded',
      'configuration_changed',
      failure(
        'conflict',
        'Business pricing or policy changed during generation. Generate a fresh draft.',
      ),
    );
  const reply = renderReply(assessment, claim.pricing.tenant.faq);
  if (reply.length > 4000)
    return reject(
      'failed',
      'reply_too_long',
      failure('generation_failed', 'The generated reply exceeds the review limit. Hand it off.'),
    );

  const nextId = randomUUID();
  const evidence = buildDraftEvidence(
    output,
    assessment,
    claim.history,
    target.message.id,
    claim.pricing.tenant.currency,
  );
  await tx.insert(drafts).values({
    tenantId,
    id: nextId,
    messageId: target.message.id,
    version: target.draft.version + 1,
    status: 'needs_approval',
    originalReply: reply,
    evidence,
    provenance: 'openai',
  });
  await tx
    .update(drafts)
    .set({
      status: 'superseded',
      revision: target.draft.revision + 1,
      evidence: { ...DraftEvidence.parse(target.draft.evidence), supersededBy: nextId },
    })
    .where(and(eq(drafts.tenantId, tenantId), eq(drafts.id, id)));
  await tx
    .update(aiRuns)
    .set({ ...metadata, status: 'succeeded', resultDraftId: nextId })
    .where(runKey);
  await tx
    .update(messages)
    .set({ processingState: 'ready' })
    .where(and(eq(messages.tenantId, tenantId), eq(messages.id, target.message.id)));
  return { ok: true, id: nextId, runId: claim.runId };
}
