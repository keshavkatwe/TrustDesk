import { type Database, messages, withTenant } from '@trustdesk/db';
import { and, eq, sql } from 'drizzle-orm';
import type { DraftProvider } from '../ai/model.ts';
import { findActiveRun } from '../ai/runs.ts';
import { createDraftingService, type DraftingService } from '../ai/service.ts';
import { createDispatchService } from '../dispatch/service.ts';
import { DRAFT_QUEUE, DraftJob, queueClient } from './client.ts';
import { recoverStalledWork } from './recovery.ts';

export async function startWorker(
  database: Database,
  connectionString: string,
  allowedTenantIds: readonly ('qamar' | 'rimal')[],
  provider?: DraftProvider,
) {
  const boss = queueClient(connectionString, true);
  const drafting = createDraftingService(database, allowedTenantIds, provider);
  const dispatch = createDispatchService(database, allowedTenantIds);
  await boss.start();
  await boss.work(DRAFT_QUEUE, { batchSize: 1, pollingIntervalSeconds: 1 }, async (jobs) => {
    for (const job of jobs) await processDraftJob(database, drafting, allowedTenantIds, job.data);
  });

  // Only one recovery/dispatch pass may run at a time. Stop waits for the active pass to finish.
  let maintenanceRunning = false;
  const runMaintenance = async () => {
    if (maintenanceRunning) return;
    maintenanceRunning = true;
    try {
      for (const tenantId of allowedTenantIds) {
        await recoverStalledWork(database, tenantId);
        for (const intent of await dispatch.pending(tenantId))
          await dispatch.dispatch(tenantId, intent.id);
      }
    } catch {
      console.error('The local workflow worker could not complete a processing pass.');
    } finally {
      maintenanceRunning = false;
    }
  };
  const timer = setInterval(() => void runMaintenance(), 1000);
  void runMaintenance();

  return {
    async stop() {
      clearInterval(timer);
      await boss.stop({ graceful: true, timeout: 50000 });
      while (maintenanceRunning) await new Promise((resolve) => setTimeout(resolve, 50));
    },
  };
}

async function processDraftJob(
  database: Database,
  drafting: DraftingService,
  allowedTenantIds: readonly string[],
  data: unknown,
) {
  const job = DraftJob.parse(data);
  if (!allowedTenantIds.includes(job.tenantId)) throw new Error('Queue business is not allowed.');
  const source = await withTenant(database, job.tenantId, (tx) =>
    tx.query.drafts.findFirst({
      columns: { id: true },
      where: (draft, { and, eq }) =>
        and(eq(draft.tenantId, job.tenantId), eq(draft.id, job.draftId)),
      with: { message: { columns: { processingState: true } } },
    }),
  );
  if (source?.message.processingState !== 'queued') return;

  const result = await drafting.generate(job.tenantId, job.draftId, { revision: job.revision });
  if (result.ok) return;

  await markDraftingFailed(database, job.tenantId, job.draftId);
  if (result.code !== 'conflict' && result.code !== 'not_found')
    throw new Error('Enquiry drafting failed; explicit retry is required.');
}

async function markDraftingFailed(database: Database, tenantId: string, draftId: string) {
  await withTenant(database, tenantId, async (tx) => {
    const draft = await tx.query.drafts.findFirst({
      columns: { messageId: true, status: true },
      where: (draft, { and, eq }) => and(eq(draft.tenantId, tenantId), eq(draft.id, draftId)),
    });
    if (draft?.status !== 'needs_approval') return;
    if (await findActiveRun(tx, tenantId, draft.messageId)) return;

    await tx
      .update(messages)
      .set({ processingState: 'failed' })
      .where(
        and(
          eq(messages.tenantId, tenantId),
          eq(messages.id, draft.messageId),
          sql`${messages.processingState} in ('queued','processing')`,
        ),
      );
  });
}
