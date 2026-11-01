import { randomUUID } from 'node:crypto';
import { type Database, deliveries, type TenantTransaction, withTenant } from '@trustdesk/db';
import { DEFAULT_MODEL } from '../ai/model.ts';
import { agentVersion, pricingVersion } from '../ai/version.ts';
import { lockTrust, readTrust } from '../evaluation/data.ts';
import { lockConversation } from '../inbox/locks.ts';
import { DraftEvidence } from '../inbox/model.ts';
import { loadPricingContext } from '../pricing/context.ts';
import { evaluateRequest } from '../pricing/evaluate.ts';
import { renderReply, sameCommercialFacts } from '../pricing/render.ts';

// Local delivery ledger only. Both named approval and trusted FAQ intents are idempotent.
export function createDispatchService(
  database: Database,
  allowedTenantIds: readonly string[],
  model = DEFAULT_MODEL,
) {
  const allowed = new Set(allowedTenantIds);
  return {
    async dispatch(tenantId: string, outboxId: string) {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const target = await readDispatchTarget(tx, tenantId, outboxId);
        if (!target) return undefined;
        const conversation = await lockConversation(
          tx,
          tenantId,
          target.draft.message.conversationId,
        );
        if (!conversation) return undefined;
        const previous = await tx.query.deliveries.findFirst({
          where: (delivery, { and, eq }) =>
            and(eq(delivery.tenantId, tenantId), eq(delivery.outboxId, outboxId)),
        });
        if (previous) return previous;
        const reason = await cancellationReason(
          tx,
          tenantId,
          target,
          conversation.latestSequence,
          model,
        );
        const [result] = await tx
          .insert(deliveries)
          .values({
            tenantId,
            outboxId,
            status: reason ? 'cancelled' : 'simulated_sent',
            reason:
              reason ??
              (target.automatic
                ? 'Trusted low-risk FAQ recorded by the local simulator; no external message was sent.'
                : 'Recorded by the local simulator; no external message was sent.'),
            simulatedMessageId: reason ? null : `sim-${randomUUID()}`,
            reply: target.reply,
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

async function readDispatchTarget(tx: TenantTransaction, tenantId: string, outboxId: string) {
  const draftColumns = { id: true, status: true, evidence: true, originalReply: true } as const;
  const message = { columns: { id: true, conversationId: true, sequence: true } } as const;
  const intent = await tx.query.outbox.findFirst({
    columns: { id: true, action: true, trustEventId: true },
    where: (intent, { and, eq }) => and(eq(intent.tenantId, tenantId), eq(intent.id, outboxId)),
    with: {
      review: {
        columns: { action: true, reply: true },
        with: { draft: { columns: draftColumns, with: { message } } },
      },
      automaticDraft: { columns: draftColumns, with: { message } },
    },
  });
  if (!intent) return null;
  if (intent.action === 'approve' && intent.review?.action === 'approve')
    return { draft: intent.review.draft, reply: intent.review.reply, automatic: false };
  if (intent.action === 'auto_send' && intent.automaticDraft && intent.trustEventId)
    return {
      draft: intent.automaticDraft,
      reply: intent.automaticDraft.originalReply,
      automatic: true,
    };
  return null;
}
type DispatchTarget = NonNullable<Awaited<ReturnType<typeof readDispatchTarget>>>;

async function cancellationReason(
  tx: TenantTransaction,
  tenantId: string,
  target: DispatchTarget,
  latestSequence: number,
  model: string,
) {
  const { draft } = target,
    { message } = draft;
  const latestDraft = await tx.query.drafts.findFirst({
    columns: { id: true },
    where: (candidate, { and, eq }) =>
      and(eq(candidate.tenantId, tenantId), eq(candidate.messageId, message.id)),
    orderBy: (candidate, { desc }) => desc(candidate.version),
  });
  if (draft.status !== 'approved') return 'No valid approval or automatic FAQ authorization.';
  if (message.sequence !== latestSequence || latestDraft?.id !== draft.id)
    return 'A newer customer message or draft replaced this reply.';
  const stored = DraftEvidence.parse(draft.evidence).assessment;
  if (!stored) return 'No verified pricing/policy assessment.';
  const pricing = await loadPricingContext(tx, tenantId, stored.catalogueVersion, model);
  if (target.automatic) {
    // Hold through ledger insertion: a concurrent failed gate cannot interleave with dispatch.
    await lockTrust(tx, tenantId);
    const event = await readTrust(tx, tenantId, agentVersion(model).id, pricingVersion(pricing));
    pricing.trust = event?.level ?? 'supervised';
    if (pricing.trust !== 'autonomous') return 'Evaluated agent trust was revoked or changed.';
  }
  const current = evaluateRequest(pricing, stored.request);
  if (current.fingerprint !== stored.fingerprint || current.blockApproval)
    return 'Pricing or policy changed after approval.';
  if (
    target.automatic &&
    (current.disposition !== 'auto_send' ||
      renderReply(current, pricing.tenant.faq) !== target.reply)
  )
    return 'Reply no longer qualifies as a verified low-risk FAQ.';
  if (!sameCommercialFacts(draft.originalReply, target.reply))
    return 'Approved wording changed commercial facts.';
  return null;
}
