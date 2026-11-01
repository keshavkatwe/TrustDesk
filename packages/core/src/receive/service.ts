import { randomUUID } from 'node:crypto';
import { type Database, withTenant } from '@trustdesk/db';
import type { EnqueueDraft } from '../queue/client.ts';
import { failure } from '../result.ts';
import { reserveConversation, saveNewMessage } from './messages.ts';
import { type ReceiptResult, type ReceiveResult, SourceEvent } from './model.ts';
import { findReceivedMessage, lockProviderMessage, saveReceipt } from './receipts.ts';
import { classifyDelivery, prepareMessage, prepareReceipt } from './rules.ts';

type TenantId = ReceiptResult['tenantId'];

export function createReceiveService(
  database: Database,
  allowedTenantIds: readonly TenantId[],
  enqueue: EnqueueDraft,
) {
  return {
    async receive(rawInput: unknown): Promise<ReceiveResult> {
      const parsed = SourceEvent.safeParse(rawInput);
      if (!parsed.success)
        return failure('invalid_request', 'Check the event fields and timestamps.');
      const event = parsed.data;
      const tenantId = await resolveTenant(database, allowedTenantIds, event);
      if (!tenantId)
        return failure(
          'unknown_destination',
          'No allowed business owns this receiving destination.',
        );

      // Every write and the queue job share this transaction. Rules below do no database I/O.
      return withTenant(database, tenantId, async (tx): Promise<ReceiveResult> => {
        await lockProviderMessage(tx, tenantId, event);
        const existing = await findReceivedMessage(tx, tenantId, event);
        const outcome = classifyDelivery(event, existing);
        const receiptId = randomUUID();
        if (existing) {
          await saveReceipt(tx, prepareReceipt(tenantId, event, existing.id, receiptId, outcome));
          if (outcome === 'conflict')
            return failure(
              'message_conflict',
              'This provider message ID already exists with different content or sender.',
            );
          const draft = existing.drafts[0];
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

        const conversation = await reserveConversation(tx, tenantId, event, randomUUID());
        const messageId = randomUUID(),
          draftId = randomUUID();
        const plan = prepareMessage(tenantId, event, conversation, messageId, draftId);
        await saveNewMessage(tx, plan);
        await saveReceipt(tx, prepareReceipt(tenantId, event, messageId, receiptId, 'accepted'));
        if (!(await enqueue(tx, { tenantId, draftId, revision: 1 })))
          throw new Error('Unable to queue the persisted enquiry.');
        return { ok: true, tenantId, receiptId, messageId, draftId, outcome: 'accepted' };
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

export type ReceiveService = ReturnType<typeof createReceiveService>;
