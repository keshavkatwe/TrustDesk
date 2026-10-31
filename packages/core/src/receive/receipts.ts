import { createHash, randomUUID } from 'node:crypto';
import { eventReceipts, type TenantTransaction } from '@trustdesk/db';
import { failure } from '../result.ts';
import type { ReceiptResult, ReceiveResult, SourceEvent } from './model.ts';

type TenantId = ReceiptResult['tenantId'];

export async function handleRedelivery(
  tx: TenantTransaction,
  tenantId: TenantId,
  event: SourceEvent,
): Promise<ReceiveResult | undefined> {
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
    return failure(
      'message_conflict',
      'This provider message ID already exists with different content or sender.',
    );

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

export async function recordReceipt(
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
