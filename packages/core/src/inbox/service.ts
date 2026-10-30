import { randomUUID } from 'node:crypto';
import {
  approvers,
  conversations,
  type Database,
  drafts,
  messages,
  outbox,
  reviews,
  type TenantTransaction,
  tenants,
  withTenant,
} from '@trustdesk/db';
import { and, desc, eq } from 'drizzle-orm';
import { DraftEvidence, Inbox, InboxItem, ReviewInput, Workspace } from './model.ts';
import { replyDiff } from './reply-diff.ts';

export type ReviewResult =
  | { ok: true; item: InboxItem }
  | {
      ok: false;
      code: 'not_found' | 'invalid_request' | 'invalid_approver' | 'conflict' | 'reason_required';
      message: string;
    };

async function readItems(tx: TenantTransaction, tenantId: string, id?: string) {
  const data = await tx
    .select({
      draft: drafts,
      message: messages,
      conversation: conversations,
      review: reviews,
      intent: outbox,
    })
    .from(drafts)
    .innerJoin(
      messages,
      and(eq(messages.tenantId, drafts.tenantId), eq(messages.id, drafts.messageId)),
    )
    .innerJoin(
      conversations,
      and(
        eq(conversations.tenantId, messages.tenantId),
        eq(conversations.id, messages.conversationId),
      ),
    )
    .leftJoin(reviews, and(eq(reviews.tenantId, drafts.tenantId), eq(reviews.draftId, drafts.id)))
    .leftJoin(outbox, and(eq(outbox.tenantId, reviews.tenantId), eq(outbox.reviewId, reviews.id)))
    .where(
      id ? and(eq(drafts.tenantId, tenantId), eq(drafts.id, id)) : eq(drafts.tenantId, tenantId),
    )
    .orderBy(desc(messages.receivedAt), desc(drafts.version));
  return data.map(({ draft, message, conversation, review, intent }) =>
    InboxItem.parse({
      ...DraftEvidence.parse(draft.evidence),
      id: draft.id,
      tenantId,
      sourceEvent: message.sourceEvent,
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
        ? { id: intent.id, status: intent.status, createdAt: intent.createdAt.toISOString() }
        : null,
    }),
  );
}

// The caller supplies the local operator's allowed businesses. This is not production authentication.
export function createInboxService(database: Database, allowedTenantIds: readonly string[]) {
  const allowed = new Set(allowedTenantIds);
  return {
    async workspace() {
      const businesses = await Promise.all(
        [...allowed].map((tenantId) =>
          withTenant(database, tenantId, async (tx) => {
            const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
            if (!tenant) return undefined;
            const people = await tx
              .select()
              .from(approvers)
              .where(eq(approvers.tenantId, tenantId))
              .orderBy(approvers.id);
            return {
              id: tenant.id,
              name: tenant.name,
              shortName: tenant.shortName,
              location: tenant.location,
              timezone: tenant.timezone,
              currency: tenant.currency,
              autoSend: tenant.autoSend,
              trust: 'supervised' as const,
              approvers: people.map(({ id, name, role }) => ({ id, name, role })),
            };
          }),
        ),
      );
      return Workspace.parse({ tenants: businesses.filter((entry) => entry !== undefined) });
    },
    async inbox(tenantId: string) {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const [tenant] = await tx
          .select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.id, tenantId));
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
        const [target] = await tx
          .select({ conversationId: messages.conversationId })
          .from(drafts)
          .innerJoin(
            messages,
            and(eq(messages.tenantId, drafts.tenantId), eq(messages.id, drafts.messageId)),
          )
          .where(and(eq(drafts.tenantId, tenantId), eq(drafts.id, id)));
        if (!target)
          return { ok: false, code: 'not_found', message: 'Draft not found in this business.' };
        // All decisions and future message-ingest updates lock the conversation first.
        const [conversation] = await tx
          .select()
          .from(conversations)
          .where(
            and(eq(conversations.tenantId, tenantId), eq(conversations.id, target.conversationId)),
          )
          .for('update');
        const [draft] = await tx
          .select()
          .from(drafts)
          .where(and(eq(drafts.tenantId, tenantId), eq(drafts.id, id)))
          .for('update');
        const [actor] = await tx
          .select()
          .from(approvers)
          .where(and(eq(approvers.tenantId, tenantId), eq(approvers.id, input.approverId)));
        if (!actor)
          return {
            ok: false,
            code: 'invalid_approver',
            message: 'Choose an approver from this business.',
          };
        if (!draft || !conversation)
          return { ok: false, code: 'not_found', message: 'Draft not found in this business.' };
        const [message] = await tx
          .select()
          .from(messages)
          .where(and(eq(messages.tenantId, tenantId), eq(messages.id, draft.messageId)));
        const [latestDraft] = await tx
          .select({ version: drafts.version })
          .from(drafts)
          .where(and(eq(drafts.tenantId, tenantId), eq(drafts.messageId, draft.messageId)))
          .orderBy(desc(drafts.version))
          .limit(1);
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
