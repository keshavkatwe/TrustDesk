import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  aiRuns,
  conversations,
  createDatabase,
  databaseUrl,
  deliveries,
  drafts,
  eventReceipts,
  messages,
  outbox,
  reviews,
  settingsChanges,
  withTenant,
} from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';
import { migrateDatabase } from '../../db/src/migrate.ts';
import { seedDatabase } from '../../db/src/seed.ts';
import { createActivityService } from '../src/activity/service.ts';
import { createSettingsService } from '../src/settings/service.ts';

const appUrl = databaseUrl('DATABASE_TEST_URL'),
  adminUrl = databaseUrl('DATABASE_TEST_ADMIN_URL');
const a = new URL(appUrl),
  b = new URL(adminUrl);
if (
  !a.pathname.endsWith('_test') ||
  a.host !== b.host ||
  a.pathname !== b.pathname ||
  a.username === b.username
)
  throw new Error('Activity tests need matching *_test databases and separate roles.');
const app = createDatabase(appUrl),
  admin = createDatabase(adminUrl);
const service = createActivityService(app, ['qamar', 'rimal']);
const id = `activity-${randomUUID()}`;
beforeAll(async () => {
  await migrateDatabase(adminUrl);
  await seedDatabase(admin);
  for (const tenantId of ['qamar', 'rimal'] as const) {
    const settings = await createSettingsService(app, [tenantId]).get(tenantId);
    if (!settings) throw new Error('Required test fixture is missing.');
    await withTenant(admin, tenantId, async (tx) => {
      await tx.insert(conversations).values({
        tenantId,
        id,
        channel: 'email',
        customer: `${tenantId}-customer`,
        latestSequence: 1,
      });
      await tx.insert(messages).values({
        tenantId,
        id,
        conversationId: id,
        sequence: 1,
        channel: 'email',
        channelMessageId: id,
        sourceEvent: id,
        body: `${tenantId} enquiry`,
        receivedAt: new Date(),
      });
      await tx.insert(drafts).values({
        tenantId,
        id,
        messageId: id,
        status: 'approved',
        originalReply: `${tenantId} reply`,
        evidence: {},
        provenance: 'sample',
      });
      await tx.insert(eventReceipts).values({
        tenantId,
        id,
        eventId: `${tenantId}-event`,
        messageId: id,
        outcome: 'accepted',
        bodyHash: 'a'.repeat(64),
      });
      await tx.insert(aiRuns).values({
        tenantId,
        id,
        messageId: id,
        sourceDraftId: id,
        sourceRevision: 1,
        model: `${tenantId}-model`,
        promptVersion: 'test',
        inputHash: 'b'.repeat(64),
        status: 'failed',
        errorCode: 'timeout',
        finishedAt: new Date(),
      });
      const approverId = tenantId === 'qamar' ? 'u_aisha' : 'u_noura';
      await tx.insert(reviews).values({
        tenantId,
        id,
        draftId: id,
        draftRevision: 1,
        approverId,
        approverName: `${tenantId} reviewer`,
        action: 'approve',
        originalReply: `${tenantId} reply`,
        reply: `${tenantId} edited reply`,
        reason: 'Test approval',
        editDiff: {},
      });
      await tx.insert(outbox).values({ tenantId, id, reviewId: id });
      await tx.insert(deliveries).values({
        tenantId,
        outboxId: id,
        status: 'simulated_sent',
        reason: 'Local simulation only',
        simulatedMessageId: `${tenantId}-simulation`,
        reply: `${tenantId} edited reply`,
        destination: `${tenantId}-customer`,
      });
      await tx.insert(settingsChanges).values({
        tenantId,
        id,
        approverId,
        approverName: `${tenantId} reviewer`,
        reason: `${tenantId} policy update`,
        before: settings.rules,
        after: { ...settings.rules, minimumOrder: '123.45' },
      });
    });
  }
}, 30000);
afterAll(async () => {
  for (const tenantId of ['qamar', 'rimal'])
    await withTenant(admin, tenantId, async (tx) => {
      await tx
        .delete(settingsChanges)
        .where(and(eq(settingsChanges.tenantId, tenantId), eq(settingsChanges.id, id)));
      await tx
        .delete(deliveries)
        .where(and(eq(deliveries.tenantId, tenantId), eq(deliveries.outboxId, id)));
      await tx.delete(outbox).where(and(eq(outbox.tenantId, tenantId), eq(outbox.id, id)));
      await tx.delete(reviews).where(and(eq(reviews.tenantId, tenantId), eq(reviews.id, id)));
      await tx.delete(aiRuns).where(and(eq(aiRuns.tenantId, tenantId), eq(aiRuns.id, id)));
      await tx
        .delete(eventReceipts)
        .where(and(eq(eventReceipts.tenantId, tenantId), eq(eventReceipts.messageId, id)));
      await tx.delete(drafts).where(and(eq(drafts.tenantId, tenantId), eq(drafts.id, id)));
      await tx.delete(messages).where(and(eq(messages.tenantId, tenantId), eq(messages.id, id)));
      await tx
        .delete(conversations)
        .where(and(eq(conversations.tenantId, tenantId), eq(conversations.id, id)));
    });
  await Promise.all([app.close(), admin.close()]);
});
test('activity joins each source within tenant scope and preserves simulated and sample provenance', async () => {
  const activity = await service.list('qamar');
  if (!activity) throw new Error('Required test fixture is missing.');
  const own = activity.entries.filter((entry) => entry.id.includes(id));
  expect(own).toHaveLength(7);
  const text = JSON.stringify(own);
  expect(text).toContain('qamar-event');
  expect(text).toContain('qamar reviewer');
  expect(text).toContain('qamar-simulation');
  expect(text).not.toContain('rimal');
  expect(own.find((entry) => entry.category === 'draft')?.outcome).toBe('sample');
  expect(own.find((entry) => entry.category === 'ai')?.outcome).toBe('failed');
  expect(own.find((entry) => entry.outcome === 'simulated_sent')?.title).toContain('simulated');
  const settings = own.find((entry) => entry.category === 'settings');
  expect(
    settings?.details.some(
      (detail) => detail.label === 'minimumOrder' && detail.value.includes('123.45'),
    ),
  ).toBe(true);
  expect(await createActivityService(app, []).list('qamar')).toBeUndefined();
});
test('activity category filters are applied before the recent window limit', async () => {
  const result = await service.list('qamar', 'review');
  if (!result) throw new Error('Required test fixture is missing.');
  expect(result.entries.every((entry) => entry.category === 'review')).toBe(true);
  expect(result.entries.some((entry) => entry.id === `review:${id}`)).toBe(true);
  const rows = Array.from({ length: 105 }, (_, index) => ({
    tenantId: 'qamar',
    id: `${id}-${String(index).padStart(3, '0')}`,
    eventId: `window-${index}`,
    messageId: id,
    outcome: 'duplicate' as const,
    bodyHash: 'c'.repeat(64),
    createdAt: new Date(4_200_000_000_000 + index),
  }));
  await withTenant(app, 'qamar', (tx) => tx.insert(eventReceipts).values(rows));
  const recent = await service.list('qamar', 'receipt');
  if (!recent) throw new Error('Required test fixture is missing.');
  expect(recent.entries).toHaveLength(100);
  expect(recent.hasMore).toBe(true);
  expect(recent.entries[0]?.reference).toBe('window-104');
  expect(recent.entries.at(-1)?.reference).toBe('window-5');
  expect(
    (await service.list('rimal', 'receipt'))?.entries.some((entry) =>
      entry.reference.startsWith('window-'),
    ),
  ).toBe(false);
});
