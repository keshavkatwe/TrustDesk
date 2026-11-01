import type { Database } from '@trustdesk/db';
import type { DraftProvider } from '../ai/model.ts';
import { createDraftingService } from '../ai/service.ts';
import { createDispatchService } from '../dispatch/service.ts';
import { DRAFT_QUEUE, queueClient } from './client.ts';
import { processDraftJob } from './process-job.ts';
import { recoverStalledWork } from './recovery.ts';

export async function startWorker(
  database: Database,
  connectionString: string,
  allowedTenantIds: readonly ('qamar' | 'rimal')[],
  provider?: DraftProvider,
) {
  const boss = queueClient(connectionString, true);
  const drafting = createDraftingService(database, allowedTenantIds, provider);
  const dispatch = createDispatchService(database, allowedTenantIds, provider?.model);
  await boss.start();
  await boss.work(DRAFT_QUEUE, { batchSize: 1, pollingIntervalSeconds: 1 }, async (jobs) => {
    for (const job of jobs) await processDraftJob(database, drafting, allowedTenantIds, job.data);
  });

  // Only one recovery/dispatch pass may run at a time. Stop waits for the active pass to finish.
  let maintenance: Promise<void> | undefined;
  const runMaintenance = () => {
    if (maintenance) return;
    maintenance = processPendingWork().finally(() => {
      maintenance = undefined;
    });
  };
  async function processPendingWork() {
    try {
      for (const tenantId of allowedTenantIds) {
        await recoverStalledWork(database, tenantId);
        for (const intent of await dispatch.pending(tenantId))
          await dispatch.dispatch(tenantId, intent.id);
      }
    } catch {
      console.error('The local workflow worker could not complete a processing pass.');
    }
  }
  const timer = setInterval(() => void runMaintenance(), 1000);
  void runMaintenance();

  return {
    async stop() {
      clearInterval(timer);
      await boss.stop({ graceful: true, timeout: 50000 });
      await maintenance;
    },
  };
}
