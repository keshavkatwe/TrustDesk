import { randomUUID } from 'node:crypto';
import { drafts, outbox, reviews, type TenantTransaction } from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';
import { loadPricingContext } from '../pricing/context.ts';
import { evaluateRequest } from '../pricing/evaluate.ts';
import { sameCommercialFacts } from '../pricing/render.ts';
import { type Failure, failure } from '../result.ts';
import { lockEnquiryDraft } from './locks.ts';
import { DraftEvidence, type InboxItem, type ReviewInput } from './model.ts';
import { readItems } from './queries.ts';
import { replyDiff } from './reply-diff.ts';

export type ReviewFailure = Failure<
  | 'not_found'
  | 'invalid_request'
  | 'invalid_approver'
  | 'conflict'
  | 'reason_required'
  | 'policy_blocked'
>;
export type ReviewResult = { ok: true; item: InboxItem } | ReviewFailure;

export async function reviewDraft(
  tx: TenantTransaction,
  tenantId: string,
  id: string,
  input: ReviewInput,
): Promise<ReviewResult> {
  const target = await lockEnquiryDraft(tx, tenantId, id);
  if (!target) return failure('not_found', 'Draft not found in this business.');
  const { draft } = target;
  const actor = await tx.query.approvers.findFirst({
    where: (actor, { and, eq }) =>
      and(eq(actor.tenantId, tenantId), eq(actor.id, input.approverId)),
  });
  if (!actor) return failure('invalid_approver', 'Choose an approver from this business.');
  if (!target.isCurrent || draft.revision !== input.revision)
    return failure(
      'conflict',
      'This draft has changed, was superseded or was already reviewed. Refresh the inbox.',
    );
  if (input.action === 'approve') {
    const rejection = await checkApproval(
      tx,
      tenantId,
      draft.originalReply,
      draft.evidence,
      input.reply,
    );
    if (rejection) return rejection;
  }

  const updated = await tx
    .update(drafts)
    .set({
      status:
        input.action === 'approve'
          ? 'approved'
          : input.action === 'reject'
            ? 'rejected'
            : 'handed_off',
      revision: draft.revision + 1,
    })
    .where(
      and(
        eq(drafts.tenantId, tenantId),
        eq(drafts.id, id),
        eq(drafts.revision, input.revision),
        eq(drafts.status, 'needs_approval'),
      ),
    )
    .returning({ id: drafts.id });
  if (!updated.length) return failure('conflict', 'Another reviewer already changed this draft.');
  const reviewId = randomUUID();
  await tx.insert(reviews).values({
    tenantId,
    id: reviewId,
    draftId: id,
    draftRevision: draft.revision,
    approverId: actor.id,
    approverName: actor.name,
    action: input.action,
    originalReply: draft.originalReply,
    reply: input.reply,
    reason: input.reason,
    editDiff: replyDiff(draft.originalReply, input.reply),
  });
  if (input.action === 'approve')
    await tx.insert(outbox).values({ tenantId, id: randomUUID(), reviewId });
  const [item] = await readItems(tx, tenantId, id);
  if (!item) throw new Error('Reviewed draft is missing.');
  return { ok: true, item };
}

async function checkApproval(
  tx: TenantTransaction,
  tenantId: string,
  originalReply: string,
  rawEvidence: unknown,
  reply: string,
): Promise<ReviewFailure | undefined> {
  const evidence = DraftEvidence.parse(rawEvidence);
  if (!evidence.assessment)
    return failure(
      'policy_blocked',
      'This legacy sample has no pricing/policy assessment. Regenerate it before approval.',
    );
  const stored = evidence.assessment;
  const context = await loadPricingContext(tx, tenantId, stored.catalogueVersion);
  const current = evaluateRequest(context, stored.request);
  if (current.fingerprint !== stored.fingerprint)
    return failure(
      'conflict',
      'Pricing or policy configuration changed. Regenerate this draft before approval.',
    );
  if (current.blockApproval)
    return failure(
      'policy_blocked',
      'Policy blocks approval. Correct the structured request, reject it or hand it off.',
    );
  if (!sameCommercialFacts(originalReply, reply))
    return failure(
      'policy_blocked',
      'Commercial numbers or currency cannot be changed in the reply. Correct the structured request and recalculate first.',
    );
}
