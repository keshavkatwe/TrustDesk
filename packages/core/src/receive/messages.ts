import { conversations, drafts, messages, type TenantTransaction } from '@trustdesk/db';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { ReceiptResult, SourceEvent } from './model.ts';
import type { NewMessage } from './rules.ts';

// The upsert locks this customer's conversation and reserves its next sequence atomically.
// A new conversation starts with message 1; an existing one advances its saved counter.
export async function reserveConversation(
  tx: TenantTransaction,
  tenantId: ReceiptResult['tenantId'],
  event: SourceEvent,
  newConversationId: string,
) {
  const [conversation] = await tx
    .insert(conversations)
    .values({
      tenantId,
      id: newConversationId,
      channel: event.channel,
      customer: event.from,
      latestSequence: 1,
    })
    .onConflictDoUpdate({
      target: [conversations.tenantId, conversations.channel, conversations.customer],
      set: { latestSequence: sql`${conversations.latestSequence} + 1` },
      setWhere: eq(conversations.tenantId, tenantId),
    })
    .returning();
  if (!conversation) throw new Error('Conversation unavailable.');
  return conversation;
}

export async function saveNewMessage(tx: TenantTransaction, plan: NewMessage) {
  const { message, draft } = plan;
  await tx.insert(messages).values(message);
  await tx
    .update(messages)
    .set({ processingState: 'superseded' })
    .where(
      and(
        eq(messages.tenantId, message.tenantId),
        eq(messages.conversationId, message.conversationId),
        lt(messages.sequence, message.sequence),
      ),
    );
  // One update for all earlier pending versions, regardless of conversation length.
  await tx
    .update(drafts)
    .set({
      status: 'superseded',
      revision: sql`${drafts.revision} + 1`,
      evidence: sql`${drafts.evidence} || ${JSON.stringify({ supersededBy: draft.id })}::jsonb`,
    })
    .where(
      and(
        eq(drafts.tenantId, message.tenantId),
        eq(drafts.status, 'needs_approval'),
        inArray(
          drafts.messageId,
          tx
            .select({ id: messages.id })
            .from(messages)
            .where(
              and(
                eq(messages.tenantId, message.tenantId),
                eq(messages.conversationId, message.conversationId),
                lt(messages.sequence, message.sequence),
              ),
            ),
        ),
      ),
    );
  await tx.insert(drafts).values(draft);
}
