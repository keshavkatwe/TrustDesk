import { randomUUID } from 'node:crypto';
import { type Database, deliveries, type TenantTransaction, withTenant } from '@trustdesk/db';
import { lockConversation } from '../inbox/locks.ts';
import { DraftEvidence } from '../inbox/model.ts';
import { loadPricingContext } from '../pricing/context.ts';
import { evaluateRequest } from '../pricing/evaluate.ts';
import { sameCommercialFacts } from '../pricing/render.ts';

// This adapter writes a local delivery ledger only. No channel API or customer contact.
export function createDispatchService(database: Database, allowedTenantIds: readonly string[]) {
  const allowed = new Set(allowedTenantIds);
  return {
    async dispatch(tenantId: string, outboxId: string) {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const target = await readDispatchTarget(tx, tenantId, outboxId);
        if (!target) return undefined;
        const { review } = target;
        const { draft } = review;
        const conversation = await lockConversation(tx, tenantId, draft.message.conversationId);
        if (!conversation) return undefined;

        const previous = await tx.query.deliveries.findFirst({
          where: (delivery, { and, eq }) =>
            and(eq(delivery.tenantId, tenantId), eq(delivery.outboxId, outboxId)),
        });
        if (previous) return previous;

        const reason = await cancellationReason(tx, tenantId, target, conversation.latestSequence);
        const [result] = await tx
          .insert(deliveries)
          .values({
            tenantId,
            outboxId,
            status: reason ? 'cancelled' : 'simulated_sent',
            reason: reason ?? 'Recorded by the local simulator; no external message was sent.',
            simulatedMessageId: reason ? null : `sim-${randomUUID()}`,
            reply: review.reply,
            destination: conversation.customer,
          })
          .returning();
        return result;
      });
    },
    async pending(tenantId: string) {
      if (!allowed.has(tenantId)) return [];
      return withTenant(database, tenantId, (tx) =>
        tx.query.outbox.findMany({
          columns: { id: true },
          where: (intent, { and, eq, notInArray }) =>
            and(
              eq(intent.tenantId, tenantId),
              // Filter before limiting. Delivery keys are non-null composite primary keys.
              notInArray(
                intent.id,
                tx
                  .select({ id: deliveries.outboxId })
                  .from(deliveries)
                  .where(eq(deliveries.tenantId, tenantId)),
              ),
            ),
          limit: 25,
        }),
      );
    },
  };
}

function readDispatchTarget(tx: TenantTransaction, tenantId: string, outboxId: string) {
  return tx.query.outbox.findFirst({
    columns: { id: true },
    where: (intent, { and, eq }) => and(eq(intent.tenantId, tenantId), eq(intent.id, outboxId)),
    with: {
      review: {
        columns: { action: true, reply: true },
        with: {
          draft: {
            columns: { id: true, status: true, evidence: true, originalReply: true },
            with: { message: { columns: { id: true, conversationId: true, sequence: true } } },
          },
        },
      },
    },
  });
}

type DispatchTarget = NonNullable<Awaited<ReturnType<typeof readDispatchTarget>>>;

async function cancellationReason(
  tx: TenantTransaction,
  tenantId: string,
  target: DispatchTarget,
  latestSequence: number,
) {
  const { review } = target;
  const { draft } = review;
  const { message } = draft;
  const latestDraft = await tx.query.drafts.findFirst({
    columns: { id: true },
    where: (candidate, { and, eq }) =>
      and(eq(candidate.tenantId, tenantId), eq(candidate.messageId, message.id)),
    orderBy: (candidate, { desc }) => desc(candidate.version),
  });
  if (review.action !== 'approve' || draft.status !== 'approved') return 'No valid named approval.';
  if (message.sequence !== latestSequence || latestDraft?.id !== draft.id)
    return 'A newer customer message or draft replaced this reply.';

  const stored = DraftEvidence.parse(draft.evidence).assessment;
  if (!stored) return 'No verified pricing/policy assessment.';
  const current = evaluateRequest(
    await loadPricingContext(tx, tenantId, stored.catalogueVersion),
    stored.request,
  );
  if (current.fingerprint !== stored.fingerprint || current.blockApproval)
    return 'Pricing or policy changed after approval.';
  if (!sameCommercialFacts(draft.originalReply, review.reply))
    return 'Approved wording changed commercial facts.';
  return null;
}
