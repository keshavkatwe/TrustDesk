import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  aiRuns,
  catalogueRows,
  conversations,
  createDatabase,
  databaseUrl,
  drafts,
  messages,
  outbox,
  reviews,
  tenants,
  withTenant,
} from '@trustdesk/db';
import { and, eq, inArray } from 'drizzle-orm';
import OpenAI from 'openai';
import { migrateDatabase } from '../../db/src/migrate.ts';
import { seedDatabase } from '../../db/src/seed.ts';
import { DEFAULT_MODEL, type DraftProvider, type ProviderResponse } from '../src/ai/model.ts';
import { createDraftingService } from '../src/ai/service.ts';
import { createInboxService } from '../src/inbox/service.ts';
import { loadPricingContext } from '../src/pricing/context.ts';
import { evaluateRequest } from '../src/pricing/evaluate.ts';
import { PricingRequest } from '../src/pricing/model.ts';
import { renderReply } from '../src/pricing/render.ts';
import { recoverStalledWork } from '../src/queue/recovery.ts';

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
  throw new Error('Draft tests require matching *_test databases and separate roles.');
const app = createDatabase(appUrl, { max: 2 }),
  other = createDatabase(appUrl, { max: 1 }),
  admin = createDatabase(adminUrl, { max: 1 });
const ids: string[] = [];
const request = PricingRequest.parse({
  intent: 'quote',
  language: 'Arabic',
  lines: [
    {
      sku: 'Q-PHN-001',
      description: 'iPhone 16',
      quantity: '5',
      unit: 'item',
      mode: 'buy',
      periods: '1',
    },
  ],
  location: 'Dubai',
  delivery: 'collection',
  deliveryTrips: null,
  discountRequested: false,
  discountPercent: null,
  budgetMinor: null,
  availabilityRequested: false,
  faqIndex: null,
  missing: [],
});
const response: ProviderResponse = {
  text: JSON.stringify({ title: 'Five iPhones', request }),
  responseId: 'mock-response',
  model: DEFAULT_MODEL,
  errorCode: null,
  usage: {
    inputTokens: 1000,
    cachedInputTokens: 0,
    outputTokens: 100,
    estimatedCostUsd: '0.001200000',
  },
};
const provider: DraftProvider = { model: DEFAULT_MODEL, generate: async () => response };
const inbox = createInboxService(app, ['qamar']);
async function fixture() {
  const id = `ai-test-${randomUUID()}`;
  ids.push(id);
  await withTenant(admin, 'qamar', async (tx) => {
    await tx
      .insert(conversations)
      .values({ tenantId: 'qamar', id, channel: 'whatsapp', customer: id, latestSequence: 1 });
    await tx.insert(messages).values({
      tenantId: 'qamar',
      id,
      conversationId: id,
      sequence: 1,
      channel: 'whatsapp',
      channelMessageId: id,
      sourceEvent: id,
      body: 'أريد شراء ٥ أجهزة آيفون 16 في دبي',
      receivedAt: new Date(),
    });
    const assessment = evaluateRequest(
      await loadPricingContext(tx, 'qamar', '2026-11-01'),
      request,
    );
    await tx.insert(drafts).values({
      tenantId: 'qamar',
      id,
      messageId: id,
      status: 'needs_approval',
      originalReply: renderReply(assessment, []),
      evidence: {
        title: 'Original draft',
        language: 'Arabic',
        context: [],
        extracted: [],
        missing: assessment.missing,
        reasons: assessment.reasons,
        assessment,
        quote: assessment.quote,
        recommendedAction: 'approve',
        supersededBy: null,
      },
    });
  });
  return id;
}
async function runs(id: string) {
  return withTenant(app, 'qamar', (tx) =>
    tx
      .select()
      .from(aiRuns)
      .where(and(eq(aiRuns.tenantId, 'qamar'), eq(aiRuns.messageId, id))),
  );
}
async function item(id: string) {
  return (await inbox.inbox('qamar'))?.items.find((entry) => entry.id === id);
}
beforeAll(async () => {
  await migrateDatabase(adminUrl);
  await seedDatabase(admin);
}, 30000);
afterAll(async () => {
  if (ids.length)
    await withTenant(admin, 'qamar', async (tx) => {
      const owned = tx.select({ id: drafts.id }).from(drafts).where(inArray(drafts.messageId, ids));
      const decided = tx
        .select({ id: reviews.id })
        .from(reviews)
        .where(inArray(reviews.draftId, owned));
      await tx.delete(outbox).where(inArray(outbox.reviewId, decided));
      await tx.delete(reviews).where(inArray(reviews.draftId, owned));
      await tx.delete(aiRuns).where(inArray(aiRuns.messageId, ids));
      await tx.delete(drafts).where(inArray(drafts.messageId, ids));
      await tx.delete(messages).where(inArray(messages.conversationId, ids));
      await tx.delete(conversations).where(inArray(conversations.id, ids));
    });
  await Promise.all([app.close(), other.close(), admin.close()]);
});
test('pricing query reads preserve bigint values above JavaScript’s safe integer range', async () => {
  const id = `money-${randomUUID()}`;
  const exact = 9007199254740993n;
  const rollback = new Error('Discard precision probe');
  await expect(
    withTenant(admin, 'qamar', async (tx) => {
      await tx.update(tenants).set({ minimumOrderMinor: exact }).where(eq(tenants.id, 'qamar'));
      await tx.insert(catalogueRows).values({
        tenantId: 'qamar',
        version: '2026-11-01',
        id,
        item: 'Precision probe',
        buyMinor: exact + 2n,
      });
      const context = await loadPricingContext(tx, 'qamar', '2026-11-01');
      expect(context.tenant.minimumOrderMinor).toBe(exact);
      expect(context.rows.find((row) => row.id === id)?.buyMinor).toBe(exact + 2n);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
test('AI result creates a priced held version, supersedes the old draft and remains reviewable', async () => {
  const id = await fixture();
  const result = await createDraftingService(app, ['qamar'], provider).generate('qamar', id, {
    revision: 1,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const next = await item(result.id);
  expect(next).toMatchObject({
    provenance: 'openai',
    draftVersion: 2,
    status: 'needs_approval',
    assessment: { quote: { totalMinor: 1784475 } },
    outbox: null,
    generation: { status: 'succeeded', responseId: 'mock-response', usage: response.usage },
  });
  expect(await item(id)).toMatchObject({
    status: 'superseded',
    supersededBy: result.id,
    revision: 2,
  });
  const versions = (await inbox.inbox('qamar'))?.items.filter((entry) =>
    [id, result.id].includes(entry.id),
  );
  expect(versions?.map((entry) => entry.id)).toEqual([result.id, id]);
  expect(
    await inbox.review('qamar', id, {
      revision: 1,
      action: 'approve',
      approverId: 'u_aisha',
      reply: 'old',
      reason: '',
    }),
  ).toMatchObject({ ok: false, code: 'conflict' });
  expect(
    await inbox.review('qamar', result.id, {
      revision: 1,
      action: 'approve',
      approverId: 'u_aisha',
      reply: next?.draftReply,
      reason: '',
    }),
  ).toMatchObject({ ok: true, item: { status: 'approved', outbox: { status: 'pending' } } });
  expect((await runs(id))[0]?.inputHash).toMatch(/^[a-f0-9]{64}$/);
});
test('competing pools invoke the provider only once; a review during inference wins safely', async () => {
  const id = await fixture();
  let calls = 0;
  const entered = Promise.withResolvers<void>(),
    completion = Promise.withResolvers<ProviderResponse>();
  const slow: DraftProvider = {
    model: DEFAULT_MODEL,
    generate: async () => {
      calls++;
      entered.resolve();
      return completion.promise;
    },
  };
  const first = createDraftingService(app, ['qamar'], slow).generate('qamar', id, { revision: 1 });
  await Promise.race([
    entered.promise,
    first.then((result) => {
      throw new Error(`Draft claim ended before reaching the provider: ${JSON.stringify(result)}`);
    }),
  ]);
  expect(
    await createDraftingService(other, ['qamar'], slow).generate('qamar', id, { revision: 1 }),
  ).toMatchObject({ ok: false, code: 'conflict' });
  const current = await item(id);
  expect(
    await inbox.review('qamar', id, {
      revision: 1,
      action: 'approve',
      approverId: 'u_aisha',
      reply: current?.draftReply,
      reason: '',
    }),
  ).toMatchObject({ ok: true });
  completion.resolve(response);
  expect(await first).toMatchObject({ ok: false, code: 'conflict' });
  expect(calls).toBe(1);
  expect((await runs(id))[0]).toMatchObject({
    status: 'superseded',
    errorCode: 'stale_draft',
    usage: response.usage,
  });
  expect(await item(id)).toMatchObject({ status: 'approved', draftVersion: 1 });
});
test('invalid JSON, extra model prices, foreign SKUs, refusal and truncation save failures without replacing a draft', async () => {
  for (const invalid of [
    { ...response, text: '{bad json' },
    { ...response, text: JSON.stringify({ title: 'Injected price', request, price: 1 }) },
    {
      ...response,
      text: JSON.stringify({
        title: 'Foreign SKU',
        request: { ...request, lines: [{ ...request.lines[0], sku: 'R-LED-001' }] },
      }),
    },
    { ...response, errorCode: 'refusal' as const },
    { ...response, errorCode: 'incomplete' as const },
  ]) {
    const id = await fixture();
    expect(
      await createDraftingService(app, ['qamar'], {
        model: DEFAULT_MODEL,
        generate: async () => invalid,
      }).generate('qamar', id, { revision: 1 }),
    ).toMatchObject({ ok: false, code: 'generation_failed' });
    expect(await item(id)).toMatchObject({
      provenance: 'sample',
      status: 'needs_approval',
      draftVersion: 1,
      revision: 1,
    });
    expect((await runs(id))[0]).toMatchObject({ status: 'failed', usage: response.usage });
  }
});
test.each([
  [new OpenAI.APIConnectionTimeoutError(), 'timeout'],
  [
    new OpenAI.APIConnectionError({ cause: new Error('private connection details') }),
    'provider_connection',
  ],
  [Object.assign(new Error('secret key and private prompt'), { status: 429 }), 'rate_limited'],
  [Object.assign(new Error('private credentials'), { status: 401 }), 'provider_auth'],
  [Object.assign(new Error('private permissions'), { status: 403 }), 'provider_auth'],
  [Object.assign(new Error('private upstream details'), { status: 503 }), 'provider_unavailable'],
  [Object.assign(new Error('private gateway details'), { status: 408 }), 'timeout'],
  [new Error('private unexpected details'), 'provider_error'],
])(
  'provider failure %# is classified safely and permits an explicit retry',
  async (error, errorCode) => {
    const id = await fixture();
    const bad: DraftProvider = {
      model: DEFAULT_MODEL,
      generate: async () => {
        throw error;
      },
    };
    const result = await createDraftingService(app, ['qamar'], bad).generate('qamar', id, {
      revision: 1,
    });
    expect(result).toMatchObject({ ok: false, code: 'generation_failed' });
    const audit = await runs(id);
    expect(audit[0]).toMatchObject({ status: 'failed', errorCode, usage: null });
    expect(JSON.stringify(audit)).not.toContain('secret key');
    expect(JSON.stringify(audit)).not.toContain('private');
    expect(await item(id)).toMatchObject({
      status: 'needs_approval',
      draftVersion: 1,
      revision: 1,
    });
    expect(
      await createDraftingService(app, ['qamar'], provider).generate('qamar', id, { revision: 1 }),
    ).toMatchObject({ ok: true });
  },
);
test('authorization, stale revisions and missing configuration fail before any paid call', async () => {
  const id = await fixture();
  let calls = 0;
  const tracked: DraftProvider = {
    model: DEFAULT_MODEL,
    generate: async () => {
      calls++;
      return response;
    },
  };
  const service = createDraftingService(app, ['qamar'], tracked);
  expect(await service.generate('rimal', id, { revision: 1 })).toMatchObject({
    ok: false,
    code: 'not_found',
  });
  expect(await service.generate('qamar', id, { revision: 2 })).toMatchObject({
    ok: false,
    code: 'conflict',
  });
  expect(
    await createDraftingService(app, ['qamar']).generate('qamar', id, { revision: 1 }),
  ).toMatchObject({ ok: false, code: 'unconfigured' });
  expect(calls).toBe(0);
  expect(await runs(id)).toHaveLength(0);
});
test('interrupted attempts expire on an explicit retry and audit rows obey forced RLS', async () => {
  const id = await fixture();
  const oldId = randomUUID();
  await withTenant(admin, 'qamar', (tx) =>
    tx.insert(aiRuns).values({
      tenantId: 'qamar',
      id: oldId,
      messageId: id,
      sourceDraftId: id,
      sourceRevision: 1,
      model: DEFAULT_MODEL,
      promptVersion: 'old',
      inputHash: 'a'.repeat(64),
      status: 'running',
      createdAt: new Date(Date.now() - 100000),
    }),
  );
  expect(
    await createDraftingService(app, ['qamar'], provider).generate('qamar', id, { revision: 1 }),
  ).toMatchObject({ ok: true });
  expect((await runs(id)).find((run) => run.id === oldId)).toMatchObject({
    status: 'failed',
    errorCode: 'interrupted',
  });
  expect(await app.db.select().from(aiRuns)).toEqual([]);
  expect(
    await withTenant(app, 'rimal', (tx) =>
      tx.select().from(aiRuns).where(eq(aiRuns.messageId, id)),
    ),
  ).toEqual([]);
});

test('a late provider response records usage without reviving an expired attempt', async () => {
  const id = await fixture();
  await withTenant(app, 'qamar', (tx) =>
    tx
      .update(messages)
      .set({ processingState: 'queued' })
      .where(and(eq(messages.tenantId, 'qamar'), eq(messages.id, id))),
  );
  const entered = Promise.withResolvers<void>();
  const completion = Promise.withResolvers<ProviderResponse>();
  const slow: DraftProvider = {
    model: DEFAULT_MODEL,
    generate: async () => {
      entered.resolve();
      return completion.promise;
    },
  };
  const pending = createDraftingService(app, ['qamar'], slow).generate('qamar', id, {
    revision: 1,
  });
  await entered.promise;
  try {
    await withTenant(admin, 'qamar', (tx) =>
      tx
        .update(aiRuns)
        .set({ createdAt: new Date(Date.now() - 100000) })
        .where(and(eq(aiRuns.tenantId, 'qamar'), eq(aiRuns.messageId, id))),
    );
    await recoverStalledWork(app, 'qamar');
    expect(await item(id)).toMatchObject({ processingState: 'failed', status: 'needs_approval' });
    completion.resolve(response);
    expect(await pending).toMatchObject({ ok: false, code: 'conflict' });
    expect((await runs(id))[0]).toMatchObject({
      status: 'failed',
      errorCode: 'interrupted',
      responseId: response.responseId,
      usage: response.usage,
      resultDraftId: null,
    });
    expect(await item(id)).toMatchObject({
      draftVersion: 1,
      revision: 1,
      status: 'needs_approval',
    });
  } finally {
    completion.resolve(response);
    await pending;
  }
});

test('pricing changes during inference supersede the attempt without replacing the held draft', async () => {
  const id = await fixture();
  const original = await withTenant(app, 'qamar', (tx) =>
    tx.query.tenants.findFirst({
      columns: { vatBasisPoints: true },
      where: (tenant, { eq }) => eq(tenant.id, 'qamar'),
    }),
  );
  if (!original) throw new Error('Missing tenant');
  let calls = 0;
  try {
    const changing: DraftProvider = {
      model: DEFAULT_MODEL,
      generate: async () => {
        calls++;
        await withTenant(admin, 'qamar', (tx) =>
          tx
            .update(tenants)
            .set({ vatBasisPoints: original.vatBasisPoints + 1 })
            .where(eq(tenants.id, 'qamar')),
        );
        return response;
      },
    };
    expect(
      await createDraftingService(app, ['qamar'], changing).generate('qamar', id, { revision: 1 }),
    ).toMatchObject({ ok: false, code: 'conflict' });
    expect(calls).toBe(1);
    expect((await runs(id))[0]).toMatchObject({
      status: 'superseded',
      errorCode: 'configuration_changed',
      usage: response.usage,
    });
    expect(await item(id)).toMatchObject({
      draftVersion: 1,
      revision: 1,
      status: 'needs_approval',
    });
  } finally {
    await withTenant(admin, 'qamar', (tx) =>
      tx
        .update(tenants)
        .set({ vatBasisPoints: original.vatBasisPoints })
        .where(eq(tenants.id, 'qamar')),
    );
  }
});

test('a failed regeneration preserves the draft’s original model/usage provenance', async () => {
  const id = await fixture();
  const generated = await createDraftingService(app, ['qamar'], provider).generate('qamar', id, {
    revision: 1,
  });
  expect(generated.ok).toBe(true);
  if (!generated.ok) return;
  const failed: DraftProvider = {
    model: 'different-model',
    generate: async () => ({ ...response, model: 'different-model', text: '{bad json' }),
  };
  expect(
    await createDraftingService(app, ['qamar'], failed).generate('qamar', generated.id, {
      revision: 1,
    }),
  ).toMatchObject({ ok: false, code: 'generation_failed' });
  const current = await item(generated.id);
  expect(current).toMatchObject({
    provenance: 'openai',
    status: 'needs_approval',
    draftVersion: 2,
    generation: { status: 'failed', model: 'different-model' },
    draftGeneration: { status: 'succeeded', model: DEFAULT_MODEL, responseId: response.responseId },
  });
});
