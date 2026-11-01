import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  aiRuns,
  conversations,
  createDatabase,
  databaseUrl,
  deliveries,
  drafts,
  evaluationLabels,
  evaluationRuns,
  messages,
  outbox,
  tenants,
  trustEvents,
  withTenant,
} from '@trustdesk/db';
import { and, eq, inArray } from 'drizzle-orm';
import { migrateDatabase } from '../../db/src/migrate.ts';
import { seedDatabase } from '../../db/src/seed.ts';
import { DEFAULT_MODEL } from '../src/ai/model.ts';
import { buildPrompt } from '../src/ai/prompt.ts';
import { createDraftingService } from '../src/ai/service.ts';
import { agentVersion, pricingVersion } from '../src/ai/version.ts';
import { createDispatchService } from '../src/dispatch/service.ts';
import { saveRun } from '../src/evaluation/data.ts';
import { regressionGate } from '../src/evaluation/gate.ts';
import { CaseResult, RunReport } from '../src/evaluation/model.ts';
import { createEvaluationService } from '../src/evaluation/service.ts';
import { DraftEvidence } from '../src/inbox/model.ts';
import { createInboxService } from '../src/inbox/service.ts';
import { loadPricingContext } from '../src/pricing/context.ts';
import { createQualityService } from '../src/quality/service.ts';

const url = databaseUrl('DATABASE_TEST_URL'),
  adminUrl = databaseUrl('DATABASE_TEST_ADMIN_URL');
const a = new URL(url),
  b = new URL(adminUrl);
if (
  !a.pathname.endsWith('_test') ||
  a.host !== b.host ||
  a.pathname !== b.pathname ||
  a.username === b.username
)
  throw new Error('Evaluation tests require matching *_test databases and separate roles.');
const app = createDatabase(url),
  other = createDatabase(url),
  admin = createDatabase(adminUrl);
const service = createEvaluationService(app, ['qamar', 'rimal']),
  competing = createEvaluationService(other, ['qamar']);
const id = `eval-test-${randomUUID()}`;
let report: RunReport;
const fixtureMessages: string[] = [];
beforeAll(async () => {
  await migrateDatabase(adminUrl);
  await seedDatabase(admin);
  const context = await withTenant(app, 'qamar', (tx) => loadPricingContext(tx, 'qamar'));
  const grade = { grade: 'pass', rationale: 'Automated test fixture only.' };
  const results = Array.from({ length: 5 }, (_, index) =>
    CaseResult.parse({
      case: {
        id: `test-${index}`,
        tenantId: 'qamar',
        category: 'normal',
        language: 'Arabic',
        messages: ['اختبار'],
        expected: {},
        guidance: 'Automated fixture, never submission evidence',
      },
      output: null,
      assessment: null,
      reply: 'اختبار',
      checks: [],
      judge: { intent_fidelity: grade, language: grade, helpfulness: grade },
      error: null,
      generation: { responseId: 'mock-test', model: DEFAULT_MODEL, durationMs: 1, usage: null },
      judging: {
        responseId: 'mock-test',
        model: DEFAULT_MODEL,
        durationMs: 1,
        usage: null,
        error: null,
      },
    }),
  );
  report = RunReport.parse({
    schemaVersion: 1,
    id,
    tenantId: 'qamar',
    createdAt: new Date().toISOString(),
    variant: 'current',
    suiteVersion: 'test-only',
    suiteHash: 'a'.repeat(64),
    contextHash: pricingVersion(context),
    agent: agentVersion(DEFAULT_MODEL),
    judge: { model: DEFAULT_MODEL, promptHash: 'b'.repeat(64), version: 'test-only' },
    baselineId: null,
    accepted: true,
    gate: regressionGate(results, null, true),
    results,
  });
  await withTenant(app, 'qamar', (tx) => saveRun(tx, report));
}, 30000);
afterAll(async () => {
  await withTenant(admin, 'qamar', async (tx) => {
    if (fixtureMessages.length) {
      const intents = await tx.query.outbox.findMany({
        where: (row, { and, eq, inArray }) =>
          and(
            eq(row.tenantId, 'qamar'),
            inArray(
              row.draftId,
              tx
                .select({ id: drafts.id })
                .from(drafts)
                .where(inArray(drafts.messageId, fixtureMessages)),
            ),
          ),
      });
      if (intents.length) {
        await tx.delete(deliveries).where(
          inArray(
            deliveries.outboxId,
            intents.map((row) => row.id),
          ),
        );
        await tx.delete(outbox).where(
          inArray(
            outbox.id,
            intents.map((row) => row.id),
          ),
        );
      }
      await tx.delete(aiRuns).where(inArray(aiRuns.messageId, fixtureMessages));
      await tx.delete(drafts).where(inArray(drafts.messageId, fixtureMessages));
      await tx.delete(messages).where(inArray(messages.id, fixtureMessages));
      await tx.delete(conversations).where(inArray(conversations.id, fixtureMessages));
    }
    await tx
      .delete(trustEvents)
      .where(and(eq(trustEvents.tenantId, 'qamar'), eq(trustEvents.runId, id)));
    await tx
      .delete(evaluationLabels)
      .where(and(eq(evaluationLabels.tenantId, 'qamar'), eq(evaluationLabels.runId, id)));
    await tx
      .delete(evaluationRuns)
      .where(and(eq(evaluationRuns.tenantId, 'qamar'), eq(evaluationRuns.id, id)));
  });
  await Promise.all([app.close(), other.close(), admin.close()]);
});
const label = (caseId: string) => ({
  caseId,
  approverId: 'u_aisha',
  dimensions: { intent_fidelity: 'pass', language: 'pass', helpfulness: 'pass' },
  rationale: 'Automated test label; test database only.',
});

test('evaluation evidence is default-deny, tenant-scoped and cannot be labelled by another business', async () => {
  expect(await app.db.select().from(evaluationRuns)).toEqual([]);
  expect(await service.run('rimal', id)).toBeUndefined();
  const brokenFilter = await withTenant(app, 'rimal', (tx) => tx.query.evaluationRuns.findMany());
  expect(brokenFilter.some((row) => row.id === id)).toBe(false);
  expect(
    (await service.label('qamar', id, { ...label('test-0'), approverId: 'u_faisal' })).ok,
  ).toBe(false);
});

test('two concurrent labels have one winner, and inadequate calibration cannot promote', async () => {
  const raced = await Promise.all([
    service.label('qamar', id, label('test-0')),
    competing.label('qamar', id, label('test-0')),
  ]);
  expect(raced.filter((value) => value.ok)).toHaveLength(1);
  expect(
    (
      await service.promote('qamar', {
        runId: id,
        approverId: 'u_aisha',
        reason: 'Test promotion attempt',
      })
    ).ok,
  ).toBe(false);
});

test('only a named local reviewer can promote current calibrated evidence; a negative label demotes it', async () => {
  for (let index = 1; index < 5; index++)
    expect((await service.label('qamar', id, label(`test-${index}`))).ok).toBe(true);
  expect(
    (
      await service.promote('qamar', {
        runId: id,
        approverId: 'u_faisal',
        reason: 'Foreign reviewer',
      })
    ).ok,
  ).toBe(false);
  expect(
    (
      await service.promote('qamar', {
        runId: id,
        approverId: 'u_aisha',
        reason: 'Automated promotion fixture, not a human endorsement',
      })
    ).ok,
  ).toBe(true);
  expect((await service.overview('qamar'))?.trust.level).toBe('autonomous');
  // Direct mutation is denied to runtime, including attempts to erase human evidence.
  await expect(
    withTenant(app, 'qamar', (tx) =>
      tx.delete(evaluationLabels).where(eq(evaluationLabels.runId, id)),
    ),
  ).rejects.toThrow();
  // A failed gate for the same evaluated version revokes promotion automatically.
  const failed = {
    ...report,
    id: `${id}-failed`,
    accepted: false,
    baselineId: id,
    createdAt: new Date(Date.now() + 10).toISOString(),
    gate: { ...report.gate, passed: false, reasons: ['Test hard violation.'], hardFailures: 1 },
  };
  try {
    await withTenant(app, 'qamar', (tx) => saveRun(tx, failed));
    expect((await service.overview('qamar'))?.trust.level).toBe('supervised');
  } finally {
    await withTenant(admin, 'qamar', async (tx) => {
      await tx.delete(trustEvents).where(eq(trustEvents.runId, failed.id));
      await tx.delete(evaluationRuns).where(eq(evaluationRuns.id, failed.id));
    });
  }
});

test('trusted FAQ drafting creates one automatic intent and simulated send; revoked trust cancels pending work', async () => {
  expect(
    (
      await service.promote('qamar', {
        runId: id,
        approverId: 'u_aisha',
        reason: 'Test-only FAQ authorization',
      })
    ).ok,
  ).toBe(true);
  const faqRequest = {
    intent: 'faq',
    language: 'English',
    lines: [],
    location: null,
    requestedDate: null,
    notes: null,
    delivery: 'unknown',
    deliveryTrips: null,
    discountRequested: false,
    discountPercent: null,
    budgetMinor: null,
    availabilityRequested: false,
    faqIndex: 0,
    missing: [],
  };
  const drafting = createDraftingService(app, ['qamar'], {
    model: DEFAULT_MODEL,
    generate: async () => ({
      model: DEFAULT_MODEL,
      responseId: 'mock-automatic-test',
      text: JSON.stringify({ title: 'Damage cover FAQ', request: faqRequest }),
      errorCode: null,
      usage: null,
    }),
  });
  const inbox = createInboxService(app, ['qamar']),
    dispatch = createDispatchService(app, ['qamar']);
  async function prepareFaq() {
    const messageId = `${id}-faq-${fixtureMessages.length}`;
    fixtureMessages.push(messageId);
    await withTenant(admin, 'qamar', async (tx) => {
      await tx.insert(conversations).values({
        tenantId: 'qamar',
        id: messageId,
        channel: 'webform',
        customer: messageId,
        latestSequence: 1,
      });
      await tx.insert(messages).values({
        tenantId: 'qamar',
        id: messageId,
        conversationId: messageId,
        sequence: 1,
        channel: 'webform',
        channelMessageId: messageId,
        sourceEvent: messageId,
        body: 'Does accidental damage cover include theft?',
        receivedAt: new Date(),
      });
      await tx.insert(drafts).values({
        tenantId: 'qamar',
        id: messageId,
        messageId,
        status: 'needs_approval',
        originalReply: 'Preparing',
        evidence: DraftEvidence.parse({
          title: 'Test FAQ',
          language: 'English',
          assessment: null,
          context: [],
          extracted: [],
          missing: [],
          reasons: [],
          quote: null,
          recommendedAction: 'approve',
          supersededBy: null,
        }),
      });
    });
    const generated = await drafting.generate('qamar', messageId, { revision: 1 });
    expect(generated.ok).toBe(true);
    if (!generated.ok) throw new Error('Test drafting failed');
    const item = (await inbox.inbox('qamar'))?.items.find((item) => item.id === generated.id);
    expect(item?.automatic).toBe(true);
    expect(item?.decision).toBeNull();
    expect(item?.outbox).not.toBeNull();
    if (!item?.outbox) throw new Error('No automatic outbox');
    return item.outbox.id;
  }
  const first = await prepareFaq();
  const raced = await Promise.all([
    dispatch.dispatch('qamar', first),
    dispatch.dispatch('qamar', first),
  ]);
  expect(raced.map((row) => row?.status)).toEqual(['simulated_sent', 'simulated_sent']);
  expect(raced[0]?.simulatedMessageId).toBe(raced[1]?.simulatedMessageId);
  const second = await prepareFaq();
  await withTenant(app, 'qamar', (tx) =>
    tx.insert(trustEvents).values({
      tenantId: 'qamar',
      id: randomUUID(),
      runId: id,
      agentId: report.agent.id,
      contextHash: report.contextHash,
      level: 'supervised',
      reason: 'Test hard violation revokes trust before dispatch',
    }),
  );
  expect((await dispatch.dispatch('qamar', second))?.status).toBe('cancelled');
});

test('a planted private canary stays out of another tenant prompt, saved output and UI payload; a broken context fails loudly', async () => {
  const canary = `QAMAR_PRIVATE_${randomUUID()}`,
    messageId = `${id}-isolation`;
  const original = await withTenant(admin, 'qamar', (tx) =>
    tx.query.tenants.findFirst({ where: (tenant, { eq }) => eq(tenant.id, 'qamar') }),
  );
  if (!original) throw new Error('Missing seeded business');
  try {
    await withTenant(admin, 'qamar', (tx) =>
      tx
        .update(tenants)
        .set({ faq: [...original.faq, canary] })
        .where(eq(tenants.id, 'qamar')),
    );
    const qamar = await withTenant(app, 'qamar', (tx) => loadPricingContext(tx, 'qamar'));
    const rimal = await withTenant(app, 'rimal', (tx) => loadPricingContext(tx, 'rimal'));
    expect(buildPrompt(qamar, []).user).toContain(canary);
    expect(buildPrompt(rimal, []).user).not.toContain(canary);
    // Deliberately omit every application filter: the restricted role's RLS still excludes Qamar.
    const brokenQuery = await withTenant(app, 'rimal', (tx) =>
      tx.query.tenants.findMany({ columns: { id: true, faq: true } }),
    );
    expect(JSON.stringify(brokenQuery)).not.toContain(canary);
    // If a caller constructs a mixed context anyway, fail before invoking or logging model input.
    expect(() => buildPrompt({ ...rimal, rows: [...rimal.rows, ...qamar.rows] }, [])).toThrow(
      'exactly one business',
    );
    await withTenant(admin, 'rimal', async (tx) => {
      await tx.insert(conversations).values({
        tenantId: 'rimal',
        id: messageId,
        channel: 'webform',
        customer: messageId,
        latestSequence: 1,
      });
      await tx.insert(messages).values({
        tenantId: 'rimal',
        id: messageId,
        conversationId: messageId,
        sequence: 1,
        channel: 'webform',
        channelMessageId: messageId,
        sourceEvent: messageId,
        body: 'What deposit confirms a booking?',
        receivedAt: new Date(),
      });
      await tx.insert(drafts).values({
        tenantId: 'rimal',
        id: messageId,
        messageId,
        status: 'needs_approval',
        originalReply: 'Preparing',
        evidence: DraftEvidence.parse({
          title: 'Isolation canary test',
          language: 'English',
          assessment: null,
          context: [],
          extracted: [],
          missing: [],
          reasons: [],
          quote: null,
          recommendedAction: 'approve',
          supersededBy: null,
        }),
      });
    });
    const request = {
      intent: 'faq',
      language: 'English',
      lines: [],
      location: null,
      requestedDate: null,
      notes: null,
      delivery: 'unknown',
      deliveryTrips: null,
      discountRequested: false,
      discountPercent: null,
      budgetMinor: null,
      availabilityRequested: false,
      faqIndex: 2,
      missing: [],
    };
    const drafting = createDraftingService(app, ['rimal'], {
      model: DEFAULT_MODEL,
      generate: async (input) => ({
        model: DEFAULT_MODEL,
        responseId: 'mock-isolation-test',
        text: JSON.stringify({
          title: input.user.includes(canary) ? canary : 'Rimal booking FAQ',
          request,
        }),
        errorCode: null,
        usage: null,
      }),
    });
    const generated = await drafting.generate('rimal', messageId, { revision: 1 });
    expect(generated.ok).toBe(true);
    const saved = await withTenant(app, 'rimal', (tx) =>
      tx.query.aiRuns.findMany({ where: (run, { eq }) => eq(run.messageId, messageId) }),
    );
    expect(JSON.stringify(saved)).not.toContain(canary);
    const inbox = await createInboxService(app, ['rimal']).inbox('rimal');
    expect(JSON.stringify(inbox)).not.toContain(canary);
    expect(
      JSON.stringify(await createQualityService(app, ['rimal']).overview('rimal')),
    ).not.toContain(canary);
  } finally {
    await withTenant(admin, 'qamar', (tx) =>
      tx.update(tenants).set({ faq: original.faq }).where(eq(tenants.id, 'qamar')),
    );
    await withTenant(admin, 'rimal', async (tx) => {
      await tx.delete(aiRuns).where(eq(aiRuns.messageId, messageId));
      await tx.delete(drafts).where(eq(drafts.messageId, messageId));
      await tx.delete(messages).where(eq(messages.id, messageId));
      await tx.delete(conversations).where(eq(conversations.id, messageId));
    });
  }
});
