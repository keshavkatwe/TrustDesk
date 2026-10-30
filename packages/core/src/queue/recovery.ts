import { type Database, messages, type TenantTransaction, withTenant } from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';
import { expireRunningAttempts, failProcessingMessage, STALLED_ATTEMPT_MS } from '../ai/runs.ts';

// Recovery marks failures for explicit retry; it never calls the model or requeues paid work.
export function recoverStalledWork(database: Database, tenantId: string) {
  return withTenant(database, tenantId, async (tx) => {
    await failAbandonedEnquiries(tx, tenantId);
    const expired = await expireRunningAttempts(tx, tenantId);
    for (const run of expired) await failProcessingMessage(tx, tenantId, run.messageId);
  });
}

async function failAbandonedEnquiries(tx: TenantTransaction, tenantId: string) {
  const abandoned = await tx.query.drafts.findMany({
    columns: { messageId: true },
    where: (draft, { and, eq, lt, inArray }) =>
      and(
        eq(draft.tenantId, tenantId),
        eq(draft.provenance, 'received'),
        eq(draft.status, 'needs_approval'),
        lt(draft.createdAt, new Date(Date.now() - STALLED_ATTEMPT_MS)),
        inArray(
          draft.messageId,
          tx
            .select({ id: messages.id })
            .from(messages)
            .where(and(eq(messages.tenantId, tenantId), eq(messages.processingState, 'queued'))),
        ),
      ),
  });
  for (const message of abandoned)
    await tx
      .update(messages)
      .set({ processingState: 'failed' })
      .where(
        and(
          eq(messages.tenantId, tenantId),
          eq(messages.id, message.messageId),
          eq(messages.processingState, 'queued'),
        ),
      );
}
