import { randomUUID } from 'node:crypto';
import {
  type Database,
  drafts,
  outbox,
  reviews,
  type TenantTransaction,
  withTenant,
} from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';
import { loadPricingContext } from '../pricing/context.ts';
import { evaluateRequest } from '../pricing/evaluate.ts';
import { sameCommercialFacts } from '../pricing/render.ts';
import { lockConversation, lockDraft } from './locks.ts';
import { DraftEvidence, Inbox, InboxItem, ReviewInput, Workspace } from './model.ts';
import { replyDiff } from './reply-diff.ts';

export type ReviewResult =
  | { ok: true; item: InboxItem }
  | {
      ok: false;
      code:
        | 'not_found'
        | 'invalid_request'
        | 'invalid_approver'
        | 'conflict'
        | 'reason_required'
        | 'policy_blocked';
      message: string;
    };

async function readItems(tx: TenantTransaction, tenantId: string, id?: string) {
  const runColumns = {
    id: true,
    status: true,
    model: true,
    promptVersion: true,
    errorCode: true,
    responseId: true,
    usage: true,
    durationMs: true,
    createdAt: true,
  } as const;
  const data = await tx.query.drafts.findMany({
    where: (draft, { and, eq }) =>
      id ? and(eq(draft.tenantId, tenantId), eq(draft.id, id)) : eq(draft.tenantId, tenantId),
    with: {
      message: {
        with: {
          conversation: true,
          aiRuns: {
            columns: runColumns,
            where: (run, { eq }) => eq(run.tenantId, tenantId),
            orderBy: (run, { desc }) => desc(run.createdAt),
            limit: 1,
          },
        },
      },
      review: { with: { outbox: { with: { delivery: true } } } },
      resultRuns: {
        columns: runColumns,
        where: (run, { eq }) => eq(run.tenantId, tenantId),
        orderBy: (run, { desc }) => desc(run.createdAt),
        limit: 1,
      },
    },
  });
  // Inbox ordering uses the related message's timestamp, then the draft version.
  data.sort(
    (a, b) =>
      b.message.receivedAt.getTime() - a.message.receivedAt.getTime() || b.version - a.version,
  );
  return data.map((draft) => {
    const { message, review } = draft;
    const { conversation } = message;
    const intent = review?.outbox;
    const delivery = intent?.delivery;
    const latestRun = message.aiRuns[0];
    const originatingRun = draft.resultRuns[0];
    return InboxItem.parse({
      ...DraftEvidence.parse(draft.evidence),
      id: draft.id,
      tenantId,
      sourceEvent: message.sourceEvent,
      provenance: draft.provenance,
      processingState: message.processingState,
      draftVersion: draft.version,
      generation: latestRun ? { ...latestRun, createdAt: latestRun.createdAt.toISOString() } : null,
      draftGeneration: originatingRun
        ? { ...originatingRun, createdAt: originatingRun.createdAt.toISOString() }
        : null,
      customer: conversation.customer,
      channel:
        message.channel === 'whatsapp'
          ? 'WhatsApp'
          : message.channel === 'email'
            ? 'Email'
            : 'Web form',
      receivedAt: message.receivedAt.toISOString(),
      body: message.body,
      draftReply: review?.reply ?? draft.originalReply,
      status: draft.status,
      revision: draft.revision,
      decision: review
        ? {
            action: review.action,
            approverName: review.approverName,
            at: review.createdAt.toISOString(),
            originalReply: review.originalReply,
            reply: review.reply,
            reason: review.reason,
            editDiff: review.editDiff,
          }
        : null,
      outbox: intent
        ? {
            id: intent.id,
            status: delivery?.status ?? intent.status,
            createdAt: intent.createdAt.toISOString(),
            completedAt: delivery?.createdAt.toISOString() ?? null,
            reason: delivery?.reason ?? null,
            simulatedMessageId: delivery?.simulatedMessageId ?? null,
          }
        : null,
    });
  });
}

// The caller supplies the local operator's allowed businesses. This is not production authentication.
export function createInboxService(database: Database, allowedTenantIds: readonly string[]) {
  const allowed = new Set(allowedTenantIds);
  return {
    async workspace() {
      const businesses = await Promise.all(
        [...allowed].map((tenantId) =>
          withTenant(database, tenantId, async (tx) => {
            const tenant = await tx.query.tenants.findFirst({
              where: (tenant, { eq }) => eq(tenant.id, tenantId),
              columns: {
                id: true,
                name: true,
                shortName: true,
                location: true,
                timezone: true,
                currency: true,
                autoSend: true,
              },
              with: {
                approvers: {
                  columns: { id: true, name: true, role: true },
                  where: (actor, { eq }) => eq(actor.tenantId, tenantId),
                  orderBy: (actor, { asc }) => asc(actor.id),
                },
                receivingChannels: {
                  columns: { channel: true, address: true },
                  where: (channel, { eq }) => eq(channel.tenantId, tenantId),
                },
              },
            });
            if (!tenant) return undefined;
            return {
              id: tenant.id,
              name: tenant.name,
              shortName: tenant.shortName,
              location: tenant.location,
              timezone: tenant.timezone,
              currency: tenant.currency,
              autoSend: tenant.autoSend,
              trust: 'supervised' as const,
              approvers: tenant.approvers,
              receivingChannels: tenant.receivingChannels,
            };
          }),
        ),
      );
      return Workspace.parse({ tenants: businesses.filter((entry) => entry !== undefined) });
    },
    async inbox(tenantId: string) {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const tenant = await tx.query.tenants.findFirst({
          columns: { id: true },
          where: (tenant, { eq }) => eq(tenant.id, tenantId),
        });
        return tenant ? Inbox.parse({ items: await readItems(tx, tenantId) }) : undefined;
      });
    },
    async review(tenantId: string, id: string, rawInput: unknown): Promise<ReviewResult> {
      if (!allowed.has(tenantId))
        return { ok: false, code: 'not_found', message: 'Draft not found in this business.' };
      const parsed = ReviewInput.safeParse(rawInput);
      if (!parsed.success)
        return {
          ok: false,
          code: 'invalid_request',
          message: 'Check the review fields and try again.',
        };
      const input = parsed.data;
      if (input.action !== 'approve' && !input.reason)
        return {
          ok: false,
          code: 'reason_required',
          message: 'Add a reason for rejecting or handing off this draft.',
        };
      return withTenant(database, tenantId, async (tx) => {
        const target = await tx.query.drafts.findFirst({
          columns: { id: true },
          where: (draft, { and, eq }) => and(eq(draft.tenantId, tenantId), eq(draft.id, id)),
          with: { message: { columns: { conversationId: true } } },
        });
        if (!target)
          return { ok: false, code: 'not_found', message: 'Draft not found in this business.' };
        // All decisions and future message-ingest updates lock the conversation first.
        const conversation = await lockConversation(tx, tenantId, target.message.conversationId);
        const draft = await lockDraft(tx, tenantId, id);
        const actor = await tx.query.approvers.findFirst({
          where: (actor, { and, eq }) =>
            and(eq(actor.tenantId, tenantId), eq(actor.id, input.approverId)),
        });
        if (!actor)
          return {
            ok: false,
            code: 'invalid_approver',
            message: 'Choose an approver from this business.',
          };
        if (!draft || !conversation)
          return { ok: false, code: 'not_found', message: 'Draft not found in this business.' };
        const message = await tx.query.messages.findFirst({
          where: (message, { and, eq }) =>
            and(eq(message.tenantId, tenantId), eq(message.id, draft.messageId)),
        });
        const latestDraft = await tx.query.drafts.findFirst({
          columns: { version: true },
          where: (candidate, { and, eq }) =>
            and(eq(candidate.tenantId, tenantId), eq(candidate.messageId, draft.messageId)),
          orderBy: (candidate, { desc }) => desc(candidate.version),
        });
        if (
          draft.status !== 'needs_approval' ||
          draft.revision !== input.revision ||
          message?.sequence !== conversation.latestSequence ||
          latestDraft?.version !== draft.version
        )
          return {
            ok: false,
            code: 'conflict',
            message:
              'This draft has changed, was superseded or was already reviewed. Refresh the inbox.',
          };
        if (input.action === 'approve') {
          const evidence = DraftEvidence.parse(draft.evidence);
          if (!evidence.assessment)
            return {
              ok: false,
              code: 'policy_blocked',
              message:
                'This legacy sample has no pricing/policy assessment. Regenerate it before approval.',
            };
          const stored = evidence.assessment;
          const context = await loadPricingContext(tx, tenantId, stored.catalogueVersion);
          const current = evaluateRequest(context, stored.request);
          if (current.fingerprint !== stored.fingerprint)
            return {
              ok: false,
              code: 'conflict',
              message:
                'Pricing or policy configuration changed. Regenerate this draft before approval.',
            };
          if (current.blockApproval)
            return {
              ok: false,
              code: 'policy_blocked',
              message:
                'Policy blocks approval. Correct the structured request, reject it or hand it off.',
            };
          if (!sameCommercialFacts(draft.originalReply, input.reply))
            return {
              ok: false,
              code: 'policy_blocked',
              message:
                'Commercial numbers or currency cannot be changed in the reply. Correct the structured request and recalculate first.',
            };
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
        if (!updated.length)
          return {
            ok: false,
            code: 'conflict',
            message: 'Another reviewer already changed this draft.',
          };
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
      });
    },
  };
}

export type InboxService = ReturnType<typeof createInboxService>;
