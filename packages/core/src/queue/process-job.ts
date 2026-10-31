import { type Database, messages, withTenant } from '@trustdesk/db';
import { and, eq, sql } from 'drizzle-orm';
import { findActiveRun } from '../ai/runs.ts';
import type { DraftingService } from '../ai/service.ts';
import { DraftJob } from './client.ts';

export async function processDraftJob(
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
