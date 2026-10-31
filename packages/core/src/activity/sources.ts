import type { TenantTransaction } from '@trustdesk/db';
import { BusinessRules } from '../settings/model.ts';
import { ACTIVITY_LIMIT, type ActivityCategory, type ActivityEntry } from './model.ts';

// Limit each source before merging, so no category can hide newer records from another.
const readers = {
  receipt: readReceiptActivity,
  draft: readDraftActivity,
  ai: readAiActivity,
  review: readReviewActivity,
  delivery: readDeliveryActivity,
  settings: readSettingsActivity,
};
export async function readActivityEntries(
  tx: TenantTransaction,
  tenantId: string,
  category?: ActivityCategory,
) {
  const selected = category ? [readers[category]] : Object.values(readers);
  const entries: ActivityEntry[] = [];
  for (const read of selected) entries.push(...(await read(tx, tenantId)));
  return entries;
}

async function readReceiptActivity(
  tx: TenantTransaction,
  tenantId: string,
): Promise<ActivityEntry[]> {
  const limit = ACTIVITY_LIMIT + 1;
  const rows = await tx.query.eventReceipts.findMany({
    where: (row, { eq }) => eq(row.tenantId, tenantId),
    orderBy: (row, { desc }) => [desc(row.createdAt), desc(row.id)],
    limit,
    with: {
      message: {
        columns: { channel: true, channelMessageId: true },
        with: { conversation: { columns: { customer: true } } },
      },
    },
  });
  return rows.map((row) =>
    entry('receipt', row.id, row.createdAt, {
      title:
        row.outcome === 'accepted'
          ? 'Message received'
          : row.outcome === 'duplicate'
            ? 'Duplicate delivery ignored'
            : 'Conflicting delivery held',
      description: `${row.message.conversation.customer} · ${row.message.channel}`,
      actor: 'Incoming adapter',
      outcome: row.outcome,
      reference: row.eventId,
      details: details({
        'Event ID': row.eventId,
        'Message ID': row.messageId,
        'Channel message ID': row.message.channelMessageId,
        'Body fingerprint': row.bodyHash,
        'Claimed business (untrusted)': row.claimedTenant ?? 'None',
      }),
    }),
  );
}

async function readDraftActivity(
  tx: TenantTransaction,
  tenantId: string,
): Promise<ActivityEntry[]> {
  const limit = ACTIVITY_LIMIT + 1;
  const rows = await tx.query.drafts.findMany({
    columns: {
      id: true,
      messageId: true,
      version: true,
      provenance: true,
      createdAt: true,
    },
    where: (row, { eq }) => eq(row.tenantId, tenantId),
    orderBy: (row, { desc }) => [desc(row.createdAt), desc(row.id)],
    limit,
  });
  return rows.map((row) =>
    entry('draft', row.id, row.createdAt, {
      title:
        row.provenance === 'openai'
          ? 'AI draft prepared'
          : row.provenance === 'sample'
            ? 'Sample draft loaded'
            : 'Draft placeholder created',
      description: `Draft version ${row.version}`,
      actor: row.provenance === 'sample' ? 'Seed loader' : 'Drafting service',
      outcome: row.provenance,
      reference: row.messageId,
      details: details({
        'Draft ID': row.id,
        'Message ID': row.messageId,
        Version: String(row.version),
        Source: row.provenance,
      }),
    }),
  );
}

async function readAiActivity(tx: TenantTransaction, tenantId: string): Promise<ActivityEntry[]> {
  const limit = ACTIVITY_LIMIT + 1;
  const rows = await tx.query.aiRuns.findMany({
    columns: {
      id: true,
      messageId: true,
      status: true,
      model: true,
      promptVersion: true,
      createdAt: true,
      finishedAt: true,
      errorCode: true,
      resultDraftId: true,
    },
    where: (row, { eq }) => eq(row.tenantId, tenantId),
    orderBy: (row, { desc }) => [desc(row.createdAt), desc(row.id)],
    limit,
  });
  return rows.map((row) =>
    entry('ai', row.id, row.createdAt, {
      title: 'AI attempt started',
      description: `${row.model} · ${row.promptVersion}`,
      actor: 'Drafting service',
      outcome: row.status,
      reference: row.messageId,
      details: details({
        'Attempt ID': row.id,
        'Message ID': row.messageId,
        'Saved outcome': row.status,
        Model: row.model,
        Prompt: row.promptVersion,
        'Finished at': row.finishedAt ?? 'Not recorded',
        'Failure category': row.errorCode ?? 'None',
        'Result draft': row.resultDraftId ?? 'None',
      }),
    }),
  );
}

async function readReviewActivity(
  tx: TenantTransaction,
  tenantId: string,
): Promise<ActivityEntry[]> {
  const limit = ACTIVITY_LIMIT + 1;
  const rows = await tx.query.reviews.findMany({
    where: (row, { eq }) => eq(row.tenantId, tenantId),
    orderBy: (row, { desc }) => [desc(row.createdAt), desc(row.id)],
    limit,
  });
  return rows.map((row) =>
    entry('review', row.id, row.createdAt, {
      title:
        row.action === 'approve'
          ? 'Reply approved'
          : row.action === 'reject'
            ? 'Reply rejected'
            : 'Enquiry handed off',
      description:
        row.reason ||
        (row.originalReply === row.reply
          ? 'Approved without wording changes.'
          : 'Approved with wording changes.'),
      actor: row.approverName,
      outcome: row.action,
      reference: row.draftId,
      details: details({
        'Review ID': row.id,
        'Draft ID': row.draftId,
        'Draft revision': String(row.draftRevision),
        Reason: row.reason || 'Not supplied',
        'Original reply': row.originalReply,
        'Reviewed reply': row.reply,
      }),
    }),
  );
}

async function readDeliveryActivity(
  tx: TenantTransaction,
  tenantId: string,
): Promise<ActivityEntry[]> {
  const entries: ActivityEntry[] = [];
  const limit = ACTIVITY_LIMIT + 1;
  const rows = await tx.query.outbox.findMany({
    where: (row, { eq }) => eq(row.tenantId, tenantId),
    orderBy: (row, { desc }) => [desc(row.createdAt), desc(row.id)],
    limit,
  });
  for (const row of rows)
    entries.push(
      entry('delivery', `intent:${row.id}`, row.createdAt, {
        title: 'Simulated delivery queued',
        description: 'Approved reply entered the local outbox.',
        actor: 'Review service',
        outcome: 'pending',
        reference: row.id,
        details: details({ 'Outbox ID': row.id, 'Review ID': row.reviewId }),
      }),
    );
  const delivered = await tx.query.deliveries.findMany({
    where: (row, { eq }) => eq(row.tenantId, tenantId),
    orderBy: (row, { desc }) => [desc(row.createdAt), desc(row.outboxId)],
    limit,
  });
  for (const row of delivered)
    entries.push(
      entry('delivery', `result:${row.outboxId}`, row.createdAt, {
        title:
          row.status === 'simulated_sent'
            ? 'Reply sent · simulated'
            : 'Simulated delivery cancelled',
        description: row.reason,
        actor: 'Local send simulator',
        outcome: row.status,
        reference: row.outboxId,
        details: details({
          'Outbox ID': row.outboxId,
          'Simulation ID': row.simulatedMessageId ?? 'None',
          Destination: row.destination,
          Reason: row.reason,
          Reply: row.reply,
        }),
      }),
    );
  return entries;
}

async function readSettingsActivity(
  tx: TenantTransaction,
  tenantId: string,
): Promise<ActivityEntry[]> {
  const entries: ActivityEntry[] = [];
  const limit = ACTIVITY_LIMIT + 1;
  const rows = await tx.query.settingsChanges.findMany({
    where: (row, { eq }) => eq(row.tenantId, tenantId),
    orderBy: (row, { desc }) => [desc(row.createdAt), desc(row.id)],
    limit,
  });
  for (const row of rows) {
    entries.push(
      entry('settings', row.id, row.createdAt, {
        title: 'Business rules updated',
        description: row.reason,
        actor: row.approverName,
        outcome: 'saved',
        reference: row.id,
        details: [...details({ Reason: row.reason }), ...changedRules(row.before, row.after)],
      }),
    );
  }
  return entries;
}

function details(values: Record<string, string | Date>) {
  return Object.entries(values).map(([label, value]) =>
    value instanceof Date
      ? { label, value: value.toISOString(), format: 'timestamp' as const }
      : { label, value },
  );
}
function entry(
  category: ActivityCategory,
  id: string,
  at: Date,
  values: Omit<ActivityEntry, 'id' | 'category' | 'at'>,
): ActivityEntry {
  return { id: `${category}:${id}`, category, at: at.toISOString(), ...values };
}

function changedRules(rawBefore: unknown, rawAfter: unknown) {
  const before = BusinessRules.safeParse(rawBefore);
  const after = BusinessRules.safeParse(rawAfter);
  if (!before.success || !after.success) return [];
  const changes: { label: string; value: string }[] = [];
  for (const key of Object.keys(before.data) as (keyof BusinessRules)[]) {
    const previous = JSON.stringify(before.data[key]);
    const next = JSON.stringify(after.data[key]);
    if (previous !== next) changes.push({ label: key, value: `${previous} → ${next}` });
  }
  return changes;
}
