import { eventReceipts, type TenantTransaction } from '@trustdesk/db';
import { sql } from 'drizzle-orm';
import type { SourceEvent } from './model.ts';
import type { prepareReceipt } from './rules.ts';

export async function lockProviderMessage(
  tx: TenantTransaction,
  tenantId: string,
  event: SourceEvent,
) {
  // Repeated deliveries of one provider message take turns until the transaction ends.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${event.channel}:${event.message_id}`}, 0))`,
  );
}

export function findReceivedMessage(tx: TenantTransaction, tenantId: string, event: SourceEvent) {
  return tx.query.messages.findFirst({
    columns: { id: true, body: true },
    where: (message, { and, eq }) =>
      and(
        eq(message.tenantId, tenantId),
        eq(message.channel, event.channel),
        eq(message.channelMessageId, event.message_id),
      ),
    with: {
      conversation: { columns: { customer: true } },
      drafts: {
        columns: { id: true },
        orderBy: (draft, { desc }) => desc(draft.version),
        limit: 1,
      },
    },
  });
}

export function saveReceipt(tx: TenantTransaction, receipt: ReturnType<typeof prepareReceipt>) {
  return tx.insert(eventReceipts).values(receipt);
}
