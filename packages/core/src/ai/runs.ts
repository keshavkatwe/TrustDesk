import { aiRuns, messages, type TenantTransaction } from '@trustdesk/db';
import { and, eq, lt } from 'drizzle-orm';

export const STALLED_ATTEMPT_MS = 90_000;

export function findActiveRun(tx: TenantTransaction, tenantId: string, messageId: string) {
  return tx.query.aiRuns.findFirst({
    columns: { id: true, createdAt: true },
    where: (run, { and, eq }) =>
      and(eq(run.tenantId, tenantId), eq(run.messageId, messageId), eq(run.status, 'running')),
  });
}

// Expire attempts without retrying paid work. A message ID limits an explicit regeneration claim.
export function expireRunningAttempts(tx: TenantTransaction, tenantId: string, messageId?: string) {
  return tx
    .update(aiRuns)
    .set({ status: 'failed', errorCode: 'interrupted', finishedAt: new Date() })
    .where(
      and(
        eq(aiRuns.tenantId, tenantId),
        eq(aiRuns.status, 'running'),
        lt(aiRuns.createdAt, new Date(Date.now() - STALLED_ATTEMPT_MS)),
        messageId === undefined ? undefined : eq(aiRuns.messageId, messageId),
      ),
    )
    .returning({ messageId: aiRuns.messageId });
}

export function failProcessingMessage(tx: TenantTransaction, tenantId: string, messageId: string) {
  return tx
    .update(messages)
    .set({ processingState: 'failed' })
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.id, messageId),
        eq(messages.processingState, 'processing'),
      ),
    );
}
