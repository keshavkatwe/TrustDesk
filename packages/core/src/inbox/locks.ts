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

export async function lockDraft(tx: TenantTransaction, tenantId: string, draftId: string) {
  const [draft] = await tx
    .select()
    .from(drafts)
    .where(and(eq(drafts.tenantId, tenantId), eq(drafts.id, draftId)))
    .for('update');
  return draft;
}
