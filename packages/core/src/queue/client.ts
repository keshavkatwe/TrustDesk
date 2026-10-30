import type { TenantTransaction } from '@trustdesk/db';
import { sql } from 'drizzle-orm';
import { fromDrizzle, PgBoss } from 'pg-boss';
import { z } from 'zod';

export const DRAFT_QUEUE = 'enquiry-draft';
export const DraftJob = z.strictObject({
  tenantId: z.enum(['qamar', 'rimal']),
  draftId: z.string().min(1),
  revision: z.number().int().positive(),
});
export type EnqueueDraft = (
  tx: TenantTransaction,
  job: z.infer<typeof DraftJob>,
) => Promise<unknown>;

export function queueClient(connectionString: string, supervise = false) {
  const boss = new PgBoss({
    connectionString,
    schema: 'pgboss',
    migrate: false,
    supervise,
    schedule: false,
    reindex: false,
  });
  boss.on('error', () => console.error('The background queue is unavailable.'));
  return boss;
}
export function draftPublisher(boss: PgBoss): EnqueueDraft {
  return (tx, job) =>
    boss.send(DRAFT_QUEUE, DraftJob.parse(job), {
      db: fromDrizzle(tx, sql),
      singletonKey: `${job.tenantId}:${job.draftId}`,
      retryLimit: 0,
      expireInSeconds: 90,
    });
}
