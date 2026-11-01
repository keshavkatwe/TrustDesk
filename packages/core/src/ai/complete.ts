import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '@trustdesk/db';
import { lockEnquiryDraft } from '../inbox/locks.ts';
import { loadPricingContext } from '../pricing/context.ts';
import { lockAttempt, saveLateCompletion, savePreparedDraft, saveRejectedDraft } from './data.ts';
import type { GeneratedDraft } from './generate.ts';
import type { DraftingResult } from './result.ts';
import { completionMetadata, type DraftAttempt, decideCompletion, prepareDraft } from './rules.ts';

export async function completeAttempt(
  tx: TenantTransaction,
  tenantId: string,
  id: string,
  claim: DraftAttempt,
  generated: GeneratedDraft,
  model: string,
): Promise<DraftingResult> {
  const target = await lockEnquiryDraft(tx, tenantId, id);
  const run = await lockAttempt(tx, tenantId, claim.runId);
  const metadata = completionMetadata(generated, model, new Date());
  const decision = decideCompletion(run.status, target, claim.target.draft.revision, generated);
  if (decision.kind === 'expired') {
    await saveLateCompletion(tx, tenantId, claim.runId, metadata);
    return decision.result;
  }
  if (decision.kind === 'rejected') {
    await saveRejectedDraft(tx, tenantId, claim, metadata, decision);
    return decision.result;
  }

  const pricing = await loadPricingContext(tx, tenantId, claim.pricing.catalogue.version);
  const prepared = prepareDraft(claim, decision.target, decision.output, pricing, randomUUID());
  if (prepared.kind === 'rejected') {
    await saveRejectedDraft(tx, tenantId, claim, metadata, prepared);
    return prepared.result;
  }
  await savePreparedDraft(tx, tenantId, claim, metadata, prepared);
  return { ok: true, id: prepared.draft.id, runId: claim.runId };
}
