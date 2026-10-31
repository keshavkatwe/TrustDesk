import { type Database, withTenant } from '@trustdesk/db';
import { BusinessRules } from '../settings/model.ts';
import { ACTIVITY_LIMIT, Activity, type ActivityCategory, type ActivityEntry } from './model.ts';

export function createActivityService(database: Database, allowedTenantIds: readonly string[]) {
  const allowed = new Set(allowedTenantIds);
  return {
    async list(tenantId: string, category?: ActivityCategory) {
      if (!allowed.has(tenantId)) return undefined;
      return withTenant(database, tenantId, async (tx) => {
        const tenant = await tx.query.tenants.findFirst({
          columns: { id: true },
          where: (t, { eq }) => eq(t.id, tenantId),
        });
        if (!tenant) return undefined;
        const entries: ActivityEntry[] = [];
        const limit = ACTIVITY_LIMIT + 1;
        if (!category || category === 'receipt') {
          const rows = await tx.query.eventReceipts.findMany({
            where: (r, { eq }) => eq(r.tenantId, tenantId),
            orderBy: (r, { desc }) => [desc(r.createdAt), desc(r.id)],
            limit,
            with: {
              message: {
                columns: { channel: true, channelMessageId: true },
                with: { conversation: { columns: { customer: true } } },
              },
            },
          });
          for (const r of rows)
            entries.push(
              entry('receipt', r.id, r.createdAt, {
                title:
                  r.outcome === 'accepted'
                    ? 'Message received'
                    : r.outcome === 'duplicate'
                      ? 'Duplicate delivery ignored'
                      : 'Conflicting delivery held',
                description: `${r.message.conversation.customer} · ${r.message.channel}`,
                actor: 'Incoming adapter',
                outcome: r.outcome,
                reference: r.eventId,
                details: details({
                  'Event ID': r.eventId,
                  'Message ID': r.messageId,
                  'Channel message ID': r.message.channelMessageId,
                  'Body fingerprint': r.bodyHash,
                  'Claimed business (untrusted)': r.claimedTenant ?? 'None',
                }),
              }),
            );
        }
        if (!category || category === 'draft') {
          const rows = await tx.query.drafts.findMany({
            columns: {
              id: true,
              messageId: true,
              version: true,
              provenance: true,
              createdAt: true,
            },
            where: (r, { eq }) => eq(r.tenantId, tenantId),
            orderBy: (r, { desc }) => [desc(r.createdAt), desc(r.id)],
            limit,
          });
          for (const r of rows)
            entries.push(
              entry('draft', r.id, r.createdAt, {
                title:
                  r.provenance === 'openai'
                    ? 'AI draft prepared'
                    : r.provenance === 'sample'
                      ? 'Sample draft loaded'
                      : 'Draft placeholder created',
                description: `Draft version ${r.version}`,
                actor: r.provenance === 'sample' ? 'Seed loader' : 'Drafting service',
                outcome: r.provenance,
                reference: r.messageId,
                details: details({
                  'Draft ID': r.id,
                  'Message ID': r.messageId,
                  Version: String(r.version),
                  Source: r.provenance,
                }),
              }),
            );
        }
        if (!category || category === 'ai') {
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
            where: (r, { eq }) => eq(r.tenantId, tenantId),
            orderBy: (r, { desc }) => [desc(r.createdAt), desc(r.id)],
            limit,
          });
          for (const r of rows)
            entries.push(
              entry('ai', r.id, r.createdAt, {
                title: 'AI attempt started',
                description: `${r.model} · ${r.promptVersion}`,
                actor: 'Drafting service',
                outcome: r.status,
                reference: r.messageId,
                details: details({
                  'Attempt ID': r.id,
                  'Message ID': r.messageId,
                  'Saved outcome': r.status,
                  Model: r.model,
                  Prompt: r.promptVersion,
                  'Finished at': r.finishedAt ?? 'Not recorded',
                  'Failure category': r.errorCode ?? 'None',
                  'Result draft': r.resultDraftId ?? 'None',
                }),
              }),
            );
        }
        if (!category || category === 'review') {
          const rows = await tx.query.reviews.findMany({
            where: (r, { eq }) => eq(r.tenantId, tenantId),
            orderBy: (r, { desc }) => [desc(r.createdAt), desc(r.id)],
            limit,
          });
          for (const r of rows)
            entries.push(
              entry('review', r.id, r.createdAt, {
                title:
                  r.action === 'approve'
                    ? 'Reply approved'
                    : r.action === 'reject'
                      ? 'Reply rejected'
                      : 'Enquiry handed off',
                description:
                  r.reason ||
                  (r.originalReply === r.reply
                    ? 'Approved without wording changes.'
                    : 'Approved with wording changes.'),
                actor: r.approverName,
                outcome: r.action,
                reference: r.draftId,
                details: details({
                  'Review ID': r.id,
                  'Draft ID': r.draftId,
                  'Draft revision': String(r.draftRevision),
                  Reason: r.reason || 'Not supplied',
                  'Original reply': r.originalReply,
                  'Reviewed reply': r.reply,
                }),
              }),
            );
        }
        if (!category || category === 'delivery') {
          const rows = await tx.query.outbox.findMany({
            where: (r, { eq }) => eq(r.tenantId, tenantId),
            orderBy: (r, { desc }) => [desc(r.createdAt), desc(r.id)],
            limit,
          });
          for (const r of rows)
            entries.push(
              entry('delivery', `intent:${r.id}`, r.createdAt, {
                title: 'Simulated delivery queued',
                description: 'Approved reply entered the local outbox.',
                actor: 'Review service',
                outcome: 'pending',
                reference: r.id,
                details: details({ 'Outbox ID': r.id, 'Review ID': r.reviewId }),
              }),
            );
          const delivered = await tx.query.deliveries.findMany({
            where: (r, { eq }) => eq(r.tenantId, tenantId),
            orderBy: (r, { desc }) => [desc(r.createdAt), desc(r.outboxId)],
            limit,
          });
          for (const r of delivered)
            entries.push(
              entry('delivery', `result:${r.outboxId}`, r.createdAt, {
                title:
                  r.status === 'simulated_sent'
                    ? 'Reply sent · simulated'
                    : 'Simulated delivery cancelled',
                description: r.reason,
                actor: 'Local send simulator',
                outcome: r.status,
                reference: r.outboxId,
                details: details({
                  'Outbox ID': r.outboxId,
                  'Simulation ID': r.simulatedMessageId ?? 'None',
                  Destination: r.destination,
                  Reason: r.reason,
                  Reply: r.reply,
                }),
              }),
            );
        }
        if (!category || category === 'settings') {
          const rows = await tx.query.settingsChanges.findMany({
            where: (r, { eq }) => eq(r.tenantId, tenantId),
            orderBy: (r, { desc }) => [desc(r.createdAt), desc(r.id)],
            limit,
          });
          for (const r of rows) {
            const before = BusinessRules.safeParse(r.before),
              after = BusinessRules.safeParse(r.after);
            const changes =
              before.success && after.success
                ? Object.keys(before.data)
                    .filter(
                      (key) =>
                        JSON.stringify(before.data[key as keyof typeof before.data]) !==
                        JSON.stringify(after.data[key as keyof typeof after.data]),
                    )
                    .map((key) => ({
                      label: key,
                      value: `${JSON.stringify(before.data[key as keyof typeof before.data])} → ${JSON.stringify(after.data[key as keyof typeof after.data])}`,
                    }))
                : [];
            entries.push(
              entry('settings', r.id, r.createdAt, {
                title: 'Business rules updated',
                description: r.reason,
                actor: r.approverName,
                outcome: 'saved',
                reference: r.id,
                details: [...details({ Reason: r.reason }), ...changes],
              }),
            );
          }
        }
        entries.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
        return Activity.parse({
          tenantId,
          updatedAt: new Date().toISOString(),
          limit: ACTIVITY_LIMIT,
          hasMore: entries.length > ACTIVITY_LIMIT,
          entries: entries.slice(0, ACTIVITY_LIMIT),
        });
      });
    },
  };
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
export type ActivityService = ReturnType<typeof createActivityService>;
