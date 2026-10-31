import { randomUUID } from 'node:crypto';
import { conversations, drafts, messages, type TenantTransaction } from '@trustdesk/db';
import { and, eq, lt } from 'drizzle-orm';
import { DraftEvidence } from '../inbox/model.ts';
import type { EnqueueDraft } from '../queue/client.ts';
import type { ReceiptResult, ReceiveResult, SourceEvent } from './model.ts';
import { recordReceipt } from './receipts.ts';

type TenantId = ReceiptResult['tenantId'];

export async function saveNewMessage(
  tx: TenantTransaction,
  tenantId: TenantId,
  event: SourceEvent,
  enqueue: EnqueueDraft,
): Promise<ReceiveResult> {
  const conversation = await getOrCreateAndLockConversation(tx, tenantId, event);
  const latestMessage = await tx.query.messages.findFirst({
    columns: { sequence: true },
    where: (message, { and, eq }) =>
      and(eq(message.tenantId, tenantId), eq(message.conversationId, conversation.id)),
    orderBy: (message, { desc }) => desc(message.sequence),
  });
  const sequence = (latestMessage?.sequence ?? 0) + 1;
  const messageId = randomUUID();
  const draftId = randomUUID();

  await tx.insert(messages).values({
    tenantId,
    id: messageId,
    conversationId: conversation.id,
    sequence,
    channel: event.channel,
    channelMessageId: event.message_id,
    sourceEvent: event.event_id,
    body: event.text,
    receivedAt: new Date(event.received_at),
    processingState: 'queued',
  });
  await tx
    .update(conversations)
    .set({ latestSequence: sequence })
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.id, conversation.id)));

  await supersedePreviousDrafts(tx, tenantId, conversation.id, sequence, draftId);
  await createPendingDraft(tx, tenantId, event, messageId, draftId);
  const receiptId = await recordReceipt(tx, tenantId, event, messageId, 'accepted');
  const queued = await enqueue(tx, { tenantId, draftId, revision: 1 });
  if (!queued) throw new Error('Unable to queue the persisted enquiry.');

  return { ok: true, tenantId, receiptId, messageId, draftId, outcome: 'accepted' };
}

async function getOrCreateAndLockConversation(
  tx: TenantTransaction,
  tenantId: TenantId,
  event: SourceEvent,
) {
  await tx
    .insert(conversations)
    .values({
      tenantId,
      id: randomUUID(),
      channel: event.channel,
      customer: event.from,
      latestSequence: 1,
    })
    .onConflictDoNothing();

  // Lock the existing or newly created conversation before changing its messages or drafts.
  const [conversation] = await tx
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, tenantId),
        eq(conversations.channel, event.channel),
        eq(conversations.customer, event.from),
      ),
    )
    .for('update');
  if (!conversation) throw new Error('Conversation unavailable.');
  return conversation;
}

async function supersedePreviousDrafts(
  tx: TenantTransaction,
  tenantId: TenantId,
  conversationId: string,
  sequence: number,
  nextDraftId: string,
) {
  const previousDrafts = await tx.query.drafts.findMany({
    columns: { id: true, revision: true, evidence: true },
    where: (draft, { and, eq, inArray }) =>
      and(
        eq(draft.tenantId, tenantId),
        eq(draft.status, 'needs_approval'),
        inArray(
          draft.messageId,
          tx
            .select({ id: messages.id })
            .from(messages)
            .where(
              and(eq(messages.tenantId, tenantId), eq(messages.conversationId, conversationId)),
            ),
        ),
      ),
  });
  await tx
    .update(messages)
    .set({ processingState: 'superseded' })
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.conversationId, conversationId),
        lt(messages.sequence, sequence),
      ),
    );
  for (const draft of previousDrafts) {
    await tx
      .update(drafts)
      .set({
        status: 'superseded',
        revision: draft.revision + 1,
        evidence: { ...DraftEvidence.parse(draft.evidence), supersededBy: nextDraftId },
      })
      .where(and(eq(drafts.tenantId, tenantId), eq(drafts.id, draft.id)));
  }
}

async function createPendingDraft(
  tx: TenantTransaction,
  tenantId: TenantId,
  event: SourceEvent,
  messageId: string,
  draftId: string,
) {
  await tx.insert(drafts).values({
    tenantId,
    id: draftId,
    messageId,
    status: 'needs_approval',
    provenance: 'received',
    originalReply: 'This enquiry needs a team member to review it before a reply is prepared.',
    evidence: DraftEvidence.parse({
      title: 'New enquiry · preparing draft',
      language: /[\u0600-\u06ff]/u.test(event.text) ? 'Arabic' : 'English',
      context: [],
      extracted: [],
      missing: [],
      reasons: [
        {
          title: 'AI drafting queued',
          detail: 'No AI reply has been prepared yet.',
          source: 'message processing',
        },
      ],
      assessment: null,
      quote: null,
      recommendedAction: 'hand_off',
      supersededBy: null,
    }),
  });
}
