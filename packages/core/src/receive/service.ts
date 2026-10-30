import { createHash, randomUUID } from 'node:crypto';
import {
  conversations,
  type Database,
  drafts,
  eventReceipts,
  messages,
  type TenantTransaction,
  withTenant,
} from '@trustdesk/db';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DraftEvidence } from '../inbox/model.ts';
import type { EnqueueDraft } from '../queue/client.ts';
import { type ReceiptResult, SourceEvent } from './model.ts';

type TenantId = ReceiptResult['tenantId'];
type Result =
  | ({ ok: true } & ReceiptResult)
  | {
      ok: false;
      code: 'invalid_request' | 'unknown_destination' | 'message_conflict';
      message: string;
    };

export function createReceiveService(
  database: Database,
  allowedTenantIds: readonly TenantId[],
  enqueue: EnqueueDraft,
) {
  return {
    async receive(rawInput: unknown): Promise<Result> {
      const parsed = SourceEvent.safeParse(rawInput);
      if (!parsed.success)
        return {
          ok: false,
          code: 'invalid_request',
          message: 'Check the event fields and timestamps.',
        };

      const event = parsed.data;
      const tenantId = await resolveTenant(database, allowedTenantIds, event);
      if (!tenantId)
        return {
          ok: false,
          code: 'unknown_destination',
          message: 'No allowed business owns this receiving destination.',
        };

      // Every write and the queue job share this transaction, including writes inside helpers.
      return withTenant(database, tenantId, async (tx): Promise<Result> => {
        // Repeated deliveries of one provider message take turns until this transaction ends.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${event.channel}:${event.message_id}`}, 0))`,
        );
        const redelivery = await handleRedelivery(tx, tenantId, event);
        if (redelivery) return redelivery;

        return saveNewMessage(tx, tenantId, event, enqueue);
      });
    },
  };
}

async function resolveTenant(
  database: Database,
  allowedTenantIds: readonly TenantId[],
  event: SourceEvent,
) {
  // Only configured receiving destinations select a business; customer metadata never does.
  for (const tenantId of allowedTenantIds) {
    const mapping = await withTenant(database, tenantId, (tx) =>
      tx.query.receivingChannels.findFirst({
        columns: { tenantId: true },
        where: (channel, { and, eq }) =>
          and(
            eq(channel.tenantId, tenantId),
            eq(channel.channel, event.channel),
            eq(channel.address, event.to),
          ),
      }),
    );
    if (mapping) return tenantId;
  }
}

async function handleRedelivery(
  tx: TenantTransaction,
  tenantId: TenantId,
  event: SourceEvent,
): Promise<Result | undefined> {
  const existing = await tx.query.messages.findFirst({
    columns: { id: true, body: true },
    where: (message, { and, eq }) =>
      and(
        eq(message.tenantId, tenantId),
        eq(message.channel, event.channel),
        eq(message.channelMessageId, event.message_id),
      ),
    with: { conversation: { columns: { customer: true } } },
  });
  if (!existing) return;

  const conflict = existing.body !== event.text || existing.conversation.customer !== event.from;
  const receiptId = await recordReceipt(
    tx,
    tenantId,
    event,
    existing.id,
    conflict ? 'conflict' : 'duplicate',
  );
  if (conflict)
    return {
      ok: false,
      code: 'message_conflict',
      message: 'This provider message ID already exists with different content or sender.',
    };

  const draft = await tx.query.drafts.findFirst({
    columns: { id: true },
    where: (draft, { and, eq }) =>
      and(eq(draft.tenantId, tenantId), eq(draft.messageId, existing.id)),
    orderBy: (draft, { desc }) => desc(draft.version),
  });
  if (!draft) throw new Error('Persisted message has no draft.');
  return {
    ok: true,
    tenantId,
    receiptId,
    messageId: existing.id,
    draftId: draft.id,
    outcome: 'duplicate',
  };
}

async function saveNewMessage(
  tx: TenantTransaction,
  tenantId: TenantId,
  event: SourceEvent,
  enqueue: EnqueueDraft,
): Promise<Result> {
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

async function recordReceipt(
  tx: TenantTransaction,
  tenantId: TenantId,
  event: SourceEvent,
  messageId: string,
  outcome: 'accepted' | 'duplicate' | 'conflict',
) {
  const receiptId = randomUUID();
  await tx.insert(eventReceipts).values({
    tenantId,
    id: receiptId,
    eventId: event.event_id,
    messageId,
    bodyHash: createHash('sha256').update(event.text).digest('hex'),
    claimedTenant: event.metadata?.tenant_id ?? null,
    outcome,
  });
  return receiptId;
}

export type ReceiveService = ReturnType<typeof createReceiveService>;
