import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '@trustdesk/db';
import { lockEnquiryDraft } from '../inbox/locks.ts';
import { loadPricingContext } from '../pricing/context.ts';
import { failure } from '../result.ts';
import { loadConversationHistory, saveAttempt } from './data.ts';
import type { DraftingFailure } from './result.ts';
import { checkDraftRevision, type DraftAttempt, prepareAttempt } from './rules.ts';
import { expireRunningAttempts, findActiveRun, STALLED_ATTEMPT_MS } from './runs.ts';

export async function claimAttempt(
  tx: TenantTransaction,
  tenantId: string,
  id: string,
  revision: number,
  model: string,
): Promise<{ ok: true; attempt: DraftAttempt } | DraftingFailure> {
  const target = await lockEnquiryDraft(tx, tenantId, id);
  if (!target) return failure('not_found', 'Draft not found in this business.');
  const rejection = checkDraftRevision(target, revision);
  if (rejection) return rejection;

  const active = await findActiveRun(tx, tenantId, target.message.id);
  if (active && active.createdAt.getTime() >= Date.now() - STALLED_ATTEMPT_MS)
    return failure('conflict', 'An AI draft is already being generated for this message.');
  if (active) await expireRunningAttempts(tx, tenantId, target.message.id);

  const pricing = await loadPricingContext(tx, tenantId, undefined, model);
  const history = await loadConversationHistory(tx, tenantId, target.conversation.id);
  const prepared = prepareAttempt(target, pricing, history, model, randomUUID());
  if (!prepared.ok) return prepared;
  await saveAttempt(tx, prepared);
  return { ok: true, attempt: prepared.attempt };
}
