import { createHash, randomUUID } from 'node:crypto';
import {
  aiRuns,
  type Database,
  drafts,
  messages,
  type TenantTransaction,
  withTenant,
} from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';
import { lockConversation, lockDraft } from '../inbox/locks.ts';
import { DraftEvidence } from '../inbox/model.ts';
import { loadPricingContext } from '../pricing/context.ts';
import { evaluateRequest, type PricingContext } from '../pricing/evaluate.ts';
import { renderReply } from '../pricing/render.ts';
import { buildDraftEvidence } from './evidence.ts';
import { type GeneratedDraft, generateDraft } from './generate.ts';
import { type DraftProvider, GenerateInput, PROMPT_VERSION, type ProviderInput } from './model.ts';
import { buildPrompt } from './prompt.ts';
import { expireRunningAttempts, failProcessingMessage, findActiveRun } from './runs.ts';

type FailureCode =
  | 'not_found'
  | 'invalid_request'
  | 'conflict'
  | 'unconfigured'
  | 'generation_failed';
type Failure = { ok: false; code: FailureCode; message: string };
type Result = { ok: true; id: string; runId: string } | Failure;
const fail = (code: FailureCode, message: string): Failure => ({ ok: false, code, message });

type Attempt = {
  runId: string;
  target: NonNullable<Awaited<ReturnType<typeof lockTarget>>>;
  pricing: PricingContext;
  history: Pick<typeof messages.$inferSelect, 'id' | 'body' | 'receivedAt' | 'sourceEvent'>[];
  input: ProviderInput;
};

export function createDraftingService(
  database: Database,
  allowedTenantIds: readonly string[],
  provider?: DraftProvider,
) {
  const allowed = new Set(allowedTenantIds);
  return {
    async generate(tenantId: string, id: string, rawInput: unknown): Promise<Result> {
      if (!allowed.has(tenantId)) return fail('not_found', 'Draft not found in this business.');
      const parsed = GenerateInput.safeParse(rawInput);
      if (!parsed.success) return fail('invalid_request', 'Refresh the draft and try again.');
      if (!provider)
        return fail('unconfigured', 'AI drafting needs OPENAI_API_KEY in the API environment.');

      const claim = await withTenant(database, tenantId, (tx) =>
        claimAttempt(tx, tenantId, id, parsed.data.revision, provider.model),
      );
      if (!claim.ok) return claim;

      // Inference is deliberately between the claim and completion transactions.
      const generated = await generateDraft(provider, claim.attempt.input, claim.attempt.pricing);
      return withTenant(database, tenantId, (tx) =>
        completeAttempt(tx, tenantId, id, claim.attempt, generated, provider.model),
      );
    },
  };
}

async function claimAttempt(
  tx: TenantTransaction,
  tenantId: string,
  id: string,
  revision: number,
  model: string,
): Promise<{ ok: true; attempt: Attempt } | Failure> {
  const target = await lockTarget(tx, tenantId, id);
  if (!target) return fail('not_found', 'Draft not found in this business.');
  if (!target.current || target.draft.revision !== revision)
    return fail('conflict', 'This draft changed or was already reviewed. Refresh the inbox.');

  await expireRunningAttempts(tx, tenantId, target.message.id);
  if (await findActiveRun(tx, tenantId, target.message.id))
    return fail('conflict', 'An AI draft is already being generated for this message.');

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
    return fail(
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

async function completeAttempt(
  tx: TenantTransaction,
  tenantId: string,
  id: string,
  claim: Attempt,
  generated: GeneratedDraft,
  model: string,
): Promise<Result> {
  const target = await lockTarget(tx, tenantId, id);
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
  async function reject(status: 'failed' | 'superseded', errorCode: string, failure: Failure) {
    await failProcessingMessage(tx, tenantId, claim.target.message.id);
    await tx
      .update(aiRuns)
      .set({ ...metadata, status, errorCode })
      .where(runKey);
    return failure;
  }

  if (run.status !== 'running') {
    // Late completions record usage but cannot revive an expired attempt.
    await tx.update(aiRuns).set(metadata).where(runKey);
    return fail('conflict', 'This AI attempt expired. Refresh the inbox.');
  }
  if (errorCode || !output)
    return reject(
      'failed',
      errorCode ?? 'invalid_output',
      fail(
        'generation_failed',
        'AI could not prepare a valid draft. Your existing draft is unchanged. Try again or hand it off.',
      ),
    );
  if (!target?.current || target.draft.revision !== claim.target.draft.revision)
    return reject(
      'superseded',
      'stale_draft',
      fail(
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
      fail(
        'conflict',
        'Business pricing or policy changed during generation. Generate a fresh draft.',
      ),
    );
  const reply = renderReply(assessment, claim.pricing.tenant.faq);
  if (reply.length > 4000)
    return reject(
      'failed',
      'reply_too_long',
      fail('generation_failed', 'The generated reply exceeds the review limit. Hand it off.'),
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

async function lockTarget(tx: TenantTransaction, tenantId: string, id: string) {
  const target = await tx.query.drafts.findFirst({
    columns: { id: true },
    where: (draft, { and, eq }) => and(eq(draft.tenantId, tenantId), eq(draft.id, id)),
    with: { message: { columns: { conversationId: true } } },
  });
  if (!target) return null;
  const conversation = await lockConversation(tx, tenantId, target.message.conversationId);
  const draft = await lockDraft(tx, tenantId, id);
  if (!draft || !conversation) return null;
  const message = await tx.query.messages.findFirst({
    where: (message, { and, eq }) =>
      and(eq(message.tenantId, tenantId), eq(message.id, draft.messageId)),
  });
  const latest = await tx.query.drafts.findFirst({
    columns: { id: true },
    where: (candidate, { and, eq }) =>
      and(eq(candidate.tenantId, tenantId), eq(candidate.messageId, draft.messageId)),
    orderBy: (candidate, { desc }) => desc(candidate.version),
  });
  if (!message) return null;
  return {
    draft,
    conversation,
    message,
    current:
      draft.status === 'needs_approval' &&
      latest?.id === id &&
      message.sequence === conversation.latestSequence,
  };
}

export type DraftingService = ReturnType<typeof createDraftingService>;
