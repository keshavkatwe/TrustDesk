import { conversations, drafts, type TenantTransaction } from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';

// Always lock the conversation before its draft; receive, review and dispatch use the same order.
export async function lockConversation(
  tx: TenantTransaction,
  tenantId: string,
  conversationId: string,
) {
  const [conversation] = await tx
    .select()
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.id, conversationId)))
    .for('update');
  return conversation;
}

async function lockDraft(tx: TenantTransaction, tenantId: string, draftId: string) {
  const [draft] = await tx
    .select()
    .from(drafts)
    .where(and(eq(drafts.tenantId, tenantId), eq(drafts.id, draftId)))
    .for('update');
  return draft;
}

export async function lockEnquiryDraft(tx: TenantTransaction, tenantId: string, id: string) {
  const target = await tx.query.drafts.findFirst({
    columns: { id: true },
    where: (draft, { and, eq }) => and(eq(draft.tenantId, tenantId), eq(draft.id, id)),
    with: { message: { columns: { conversationId: true } } },
  });
  if (!target) return null;
  const conversation = await lockConversation(tx, tenantId, target.message.conversationId);
  const draft = await lockDraft(tx, tenantId, id);
  if (!draft || !conversation) return null;
  // The latest version is related data, so load it with the message in one statement.
  const messageWithDrafts = await tx.query.messages.findFirst({
    where: (message, { and, eq }) =>
      and(eq(message.tenantId, tenantId), eq(message.id, draft.messageId)),
    with: {
      drafts: {
        columns: { id: true },
        orderBy: (candidate, { desc }) => desc(candidate.version),
        limit: 1,
      },
    },
  });
  if (!messageWithDrafts) return null;
  const { drafts: versions, ...message } = messageWithDrafts;
  return {
    draft,
    conversation,
    message,
    isCurrent:
      draft.status === 'needs_approval' &&
      versions[0]?.id === id &&
      message.sequence === conversation.latestSequence,
  };
}

export type LockedDraft = NonNullable<Awaited<ReturnType<typeof lockEnquiryDraft>>>;
