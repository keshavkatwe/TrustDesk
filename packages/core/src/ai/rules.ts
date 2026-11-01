import { createHash } from 'node:crypto';
import type { aiRuns, messages } from '@trustdesk/db';
import type { LockedDraft } from '../inbox/locks.ts';
import { DraftEvidence } from '../inbox/model.ts';
import { evaluateRequest, type PricingContext } from '../pricing/evaluate.ts';
import { renderReply } from '../pricing/render.ts';
import { failure } from '../result.ts';
import { buildDraftEvidence } from './evidence.ts';
import type { GeneratedDraft } from './generate.ts';
import { type DraftOutput, PROMPT_VERSION, type ProviderInput } from './model.ts';
import { buildPrompt } from './prompt.ts';
import type { DraftingFailure } from './result.ts';
import { agentVersion } from './version.ts';

export type ConversationHistory = Pick<
  typeof messages.$inferSelect,
  'id' | 'body' | 'receivedAt' | 'sourceEvent'
>[];
export type DraftAttempt = {
  runId: string;
  target: LockedDraft;
  pricing: PricingContext;
  history: ConversationHistory;
  input: ProviderInput;
};

export function checkDraftRevision(target: LockedDraft, revision: number) {
  if (!target.isCurrent || target.draft.revision !== revision)
    return failure('conflict', 'This draft changed or was already reviewed. Refresh the inbox.');
}

export function prepareAttempt(
  target: LockedDraft,
  pricing: PricingContext,
  history: ConversationHistory,
  model: string,
  runId: string,
) {
  const input = buildPrompt(pricing, history);
  if (history.length > 20 || input.user.length > 32000)
    return failure(
      'invalid_request',
      'This conversation exceeds the current drafting limit. Hand it off for review.',
    );
  const attempt: DraftAttempt = { target, pricing, history, input, runId };
  const run = {
    tenantId: target.draft.tenantId,
    id: runId,
    messageId: target.message.id,
    sourceDraftId: target.draft.id,
    sourceRevision: target.draft.revision,
    model,
    promptVersion: PROMPT_VERSION,
    status: 'running',
    output: { agent: agentVersion(model) },
    inputHash: createHash('sha256').update(input.system).update(input.user).digest('hex'),
  } satisfies typeof aiRuns.$inferInsert;
  return { ok: true as const, attempt, run };
}

export function completionMetadata(generated: GeneratedDraft, fallbackModel: string, now: Date) {
  const { response } = generated;
  return {
    responseId: response?.responseId ?? null,
    model: response?.model ?? fallbackModel,
    usage: response?.usage ?? null,
    output: {
      agent: agentVersion(response?.model ?? fallbackModel),
      text: response?.text.slice(0, 16000) ?? null,
    },
    durationMs: Math.max(0, now.getTime() - generated.startedAt),
    finishedAt: now,
  };
}

export function decideCompletion(
  runStatus: string,
  target: LockedDraft | null,
  sourceRevision: number,
  generated: GeneratedDraft,
) {
  if (runStatus !== 'running')
    return {
      kind: 'expired' as const,
      result: failure('conflict', 'This AI attempt expired. Refresh the inbox.'),
    };
  if (generated.errorCode || !generated.output)
    return rejectDraft(
      'failed',
      generated.errorCode ?? 'invalid_output',
      failure(
        'generation_failed',
        'AI could not prepare a valid draft. Your existing draft is unchanged. Try again or hand it off.',
      ),
    );
  if (!target?.isCurrent || target.draft.revision !== sourceRevision)
    return rejectDraft(
      'superseded',
      'stale_draft',
      failure(
        'conflict',
        'The enquiry or review changed during generation. The AI result was not applied.',
      ),
    );
  return { kind: 'prepare' as const, target, output: generated.output };
}

export function prepareDraft(
  claim: DraftAttempt,
  target: LockedDraft,
  output: DraftOutput,
  currentPricing: PricingContext,
  nextId: string,
) {
  const assessment = evaluateRequest(claim.pricing, output.request);
  if (evaluateRequest(currentPricing, output.request).fingerprint !== assessment.fingerprint)
    return rejectDraft(
      'superseded',
      'configuration_changed',
      failure(
        'conflict',
        'Business pricing or policy changed during generation. Generate a fresh draft.',
      ),
    );
  const reply = renderReply(assessment, claim.pricing.tenant.faq);
  if (reply.length > 4000)
    return rejectDraft(
      'failed',
      'reply_too_long',
      failure('generation_failed', 'The generated reply exceeds the review limit. Hand it off.'),
    );
  return {
    kind: 'prepared' as const,
    draft: {
      tenantId: target.draft.tenantId,
      id: nextId,
      messageId: target.message.id,
      version: target.draft.version + 1,
      status: 'needs_approval' as const,
      originalReply: reply,
      evidence: buildDraftEvidence(
        output,
        assessment,
        claim.history,
        target.message.id,
        claim.pricing.tenant.currency,
      ),
      provenance: 'openai' as const,
    },
    sourceChanges: {
      status: 'superseded' as const,
      revision: target.draft.revision + 1,
      evidence: { ...DraftEvidence.parse(target.draft.evidence), supersededBy: nextId },
    },
  };
}

function rejectDraft(status: 'failed' | 'superseded', errorCode: string, result: DraftingFailure) {
  return { kind: 'rejected' as const, status, errorCode, result };
}
export type RejectedDraft = ReturnType<typeof rejectDraft>;
export type PreparedAttempt = Extract<ReturnType<typeof prepareAttempt>, { ok: true }>;
export type PreparedDraft = Extract<ReturnType<typeof prepareDraft>, { kind: 'prepared' }>;
export type CompletionMetadata = ReturnType<typeof completionMetadata>;
