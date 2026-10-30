import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  aiRuns,
  conversations,
  createDatabase,
  databaseUrl,
  drafts,
  messages,
  reviews,
  withTenant,
} from '@trustdesk/db';
import { and, eq, inArray } from 'drizzle-orm';
import { migrateDatabase } from '../../db/src/migrate.ts';
import { seedDatabase } from '../../db/src/seed.ts';
import { createQualityService } from '../src/quality/service.ts';

const appUrl = databaseUrl('DATABASE_TEST_URL');
const adminUrl = databaseUrl('DATABASE_TEST_ADMIN_URL');
const a = new URL(appUrl),
  b = new URL(adminUrl);
if (
  !a.pathname.endsWith('_test') ||
  a.host !== b.host ||
  a.pathname !== b.pathname ||
  a.username === b.username
)
  throw new Error('Quality tests require matching *_test databases and separate roles.');
const app = createDatabase(appUrl),
  admin = createDatabase(adminUrl);
const fixtureIds: string[] = [];
const service = createQualityService(app, ['qamar', 'rimal'], 'configured-model');
const sharedRunId = randomUUID();

function evidence(title: string) {
  return {
    title,
    language: 'English',
    context: [],
    extracted: [],
    missing: [],
    reasons: [],
    assessment: null,
    quote: null,
    recommendedAction: 'hand_off',
    supersededBy: null,
  };
}
async function fixture(tenantId: 'qamar' | 'rimal') {
  const id = `quality-${randomUUID()}`;
  fixtureIds.push(id);
  const sourceId = `${id}-source`,
    resultId = `${id}-result`;
  await withTenant(admin, tenantId, async (tx) => {
    await tx
      .insert(conversations)
      .values({ tenantId, id, channel: 'email', customer: id, latestSequence: 1 });
    await tx.insert(messages).values({
      tenantId,
      id,
      conversationId: id,
      sequence: 1,
      channel: 'email',
      channelMessageId: id,
      sourceEvent: id,
      body: `${tenantId} private enquiry`,
      receivedAt: new Date(),
    });
    await tx.insert(drafts).values([
      {
        tenantId,
        id: sourceId,
        messageId: id,
        status: 'superseded',
        originalReply: 'Pending review',
        evidence: evidence('Original enquiry'),
        provenance: 'received',
      },
      {
        tenantId,
        id: resultId,
        messageId: id,
        version: 2,
        status: 'approved',
        originalReply: `${tenantId} saved reply`,
        evidence: evidence(`${tenantId} prepared enquiry`),
        provenance: 'openai',
      },
    ]);
    await tx.insert(reviews).values({
      tenantId,
      id: randomUUID(),
      draftId: resultId,
      draftRevision: 1,
      approverId: tenantId === 'qamar' ? 'u_aisha' : 'u_noura',
      approverName: 'Named test reviewer',
      action: 'approve',
      originalReply: `${tenantId} saved reply`,
      reply: `${tenantId} saved reply. Please confirm.`,
      reason: '',
      editDiff: { start: 0, removed: '', added: '' },
    });
    await tx.insert(aiRuns).values({
      tenantId,
      id: sharedRunId,
      messageId: id,
      sourceDraftId: sourceId,
      sourceRevision: 1,
      resultDraftId: resultId,
      model: 'saved-model',
      promptVersion: 'saved-prompt',
      inputHash: 'a'.repeat(64),
      status: 'succeeded',
      responseId: `${tenantId}-response`,
      durationMs: 100,
      usage: {
        inputTokens: 1,
        cachedInputTokens: 0,
        outputTokens: 1,
        estimatedCostUsd: '0.000000001',
      },
      finishedAt: new Date(),
    });
  });
  return { id, sourceId, resultId };
}

let qamar: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  await migrateDatabase(adminUrl);
  await seedDatabase(admin);
  qamar = await fixture('qamar');
  await fixture('rimal');
}, 30000);
afterAll(async () => {
  for (const tenantId of ['qamar', 'rimal'])
    await withTenant(admin, tenantId, async (tx) => {
      const ownedDrafts = tx
        .select({ id: drafts.id })
        .from(drafts)
        .where(and(eq(drafts.tenantId, tenantId), inArray(drafts.messageId, fixtureIds)));
      await tx
        .delete(reviews)
        .where(and(eq(reviews.tenantId, tenantId), inArray(reviews.draftId, ownedDrafts)));
      await tx
        .delete(aiRuns)
        .where(and(eq(aiRuns.tenantId, tenantId), inArray(aiRuns.messageId, fixtureIds)));
      await tx
        .delete(drafts)
        .where(and(eq(drafts.tenantId, tenantId), inArray(drafts.messageId, fixtureIds)));
      await tx
        .delete(messages)
        .where(and(eq(messages.tenantId, tenantId), inArray(messages.id, fixtureIds)));
      await tx
        .delete(conversations)
        .where(and(eq(conversations.tenantId, tenantId), inArray(conversations.id, fixtureIds)));
    });
  await Promise.all([app.close(), admin.close()]);
});

test('quality evidence resolves colliding run IDs within tenant scope and never grants trust', async () => {
  const overview = await service.overview('qamar');
  expect(overview?.summary).toMatchObject({
    total: 1,
    prepared: 1,
    estimatedCostUsd: '0.000000001',
    reviews: { approved: 1, edited: 1 },
  });
  expect(overview?.trust).toEqual({ level: 'supervised', promotionAvailable: false });
  expect(overview?.configuration).toMatchObject({
    model: 'configured-model',
    autoSend: 'low_risk_only',
  });
  expect(overview?.attempts[0]).toMatchObject({
    model: 'saved-model',
    promptVersion: 'saved-prompt',
  });
  expect((await service.attempt('qamar', sharedRunId))?.reply).toBe('qamar saved reply');
  expect((await service.attempt('rimal', sharedRunId))?.reply).toBe('rimal saved reply');
  expect(await createQualityService(app, ['qamar']).attempt('rimal', sharedRunId)).toBeUndefined();
  expect(await createQualityService(app, ['qamar']).overview('rimal')).toBeUndefined();
  expect(await service.attempt('qamar', 'missing')).toBeUndefined();
});

test('a failed regeneration exposes no new reply or review from its source draft', async () => {
  const id = randomUUID();
  await withTenant(app, 'qamar', (tx) =>
    tx.insert(aiRuns).values({
      tenantId: 'qamar',
      id,
      messageId: qamar.id,
      sourceDraftId: qamar.resultId,
      sourceRevision: 1,
      model: 'other-model',
      promptVersion: 'other-prompt',
      inputHash: 'b'.repeat(64),
      status: 'failed',
      errorCode: 'timeout',
      finishedAt: new Date(),
    }),
  );
  const detail = await service.attempt('qamar', id);
  expect(detail).toMatchObject({
    status: 'failed',
    reply: null,
    assessment: null,
    resultDraftId: null,
    review: null,
    usage: null,
  });
  expect((await service.overview('qamar'))?.summary).toMatchObject({
    total: 2,
    failed: 1,
    unpriced: 1,
    reviews: { approved: 1 },
  });
});

test('the operational evidence window is bounded to the latest 50 attempts', async () => {
  const rows = Array.from({ length: 55 }, (_, index) => ({
    tenantId: 'qamar',
    id: randomUUID(),
    messageId: qamar.id,
    sourceDraftId: qamar.sourceId,
    sourceRevision: 1,
    model: 'window-model',
    promptVersion: 'window-prompt',
    inputHash: 'c'.repeat(64),
    status: 'failed' as const,
    errorCode: 'provider_error',
    createdAt: new Date(1_900_000_000_000 + index),
    finishedAt: new Date(1_900_000_000_100 + index),
  }));
  await withTenant(app, 'qamar', (tx) => tx.insert(aiRuns).values(rows));
  const overview = await service.overview('qamar');
  expect(overview?.attempts).toHaveLength(50);
  expect(overview?.summary).toMatchObject({
    total: 50,
    failed: 50,
    prepared: 0,
    estimatedCostUsd: null,
    unpriced: 50,
  });
  expect(overview?.attempts[0]?.id).toBe(rows[54]?.id);
  expect(overview?.attempts.at(-1)?.id).toBe(rows[5]?.id);
  expect(overview?.trust.promotionAvailable).toBe(false);
});
