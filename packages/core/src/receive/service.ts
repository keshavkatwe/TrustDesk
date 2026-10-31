import { type Database, withTenant } from '@trustdesk/db';
import { sql } from 'drizzle-orm';
import type { EnqueueDraft } from '../queue/client.ts';
import { failure } from '../result.ts';
import { saveNewMessage } from './messages.ts';
import { type ReceiptResult, type ReceiveResult, SourceEvent } from './model.ts';
import { handleRedelivery } from './receipts.ts';

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

      // Every write and the queue job share this transaction, including writes inside helpers.
      return withTenant(database, tenantId, async (tx): Promise<ReceiveResult> => {
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

export type ReceiveService = ReturnType<typeof createReceiveService>;
