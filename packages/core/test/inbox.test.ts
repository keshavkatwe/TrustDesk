import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import {
  conversations,
  createDatabase,
  databaseUrl,
  drafts,
  messages,
  outbox,
  reviews,
  withTenant,
} from '@trustdesk/db';
import { migrateDatabase } from '@trustdesk/db/migrate';
import { seedDatabase } from '@trustdesk/db/seed';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DraftEvidence } from '../src/inbox/model.ts';
import { seedInbox } from '../src/inbox/seed.ts';
import { createInboxService } from '../src/inbox/service.ts';

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
  throw new Error(
    'Inbox tests require matching *_test databases and separate app/migration roles.',
  );
const app = createDatabase(appUrl, { max: 2 });
const other = createDatabase(appUrl, { max: 1 });
const admin = createDatabase(adminUrl, { max: 1 });
const service = createInboxService(app, ['qamar', 'rimal']);
const second = createInboxService(other, ['qamar', 'rimal']);
const probes: { tenantId: 'qamar' | 'rimal'; id: string }[] = [];
const evidence = DraftEvidence.parse({
  title: 'Integration probe',
  language: 'Arabic',
  context: [],
  extracted: [],
  missing: [],
  reasons: [],
  quote: null,
  recommendedAction: 'approve',
  supersededBy: null,
});
const input = {
  approverId: 'u_aisha',
  revision: 1,
  action: 'approve',
  reply: 'مرحباً 🌙',
  reason: '',
};

async function fixture(tenantId: 'qamar' | 'rimal' = 'qamar') {
  const id = `test-${randomUUID()}`;
  probes.push({ tenantId, id });
  await withTenant(admin, tenantId, async (tx) => {
    await tx
      .insert(conversations)
      .values({ tenantId, id, channel: 'whatsapp', customer: id, latestSequence: 1 });
    await tx.insert(messages).values({
      tenantId,
      id,
      conversationId: id,
      sequence: 1,
      channel: 'whatsapp',
      channelMessageId: id,
      sourceEvent: id,
      body: 'طلب تجريبي',
      receivedAt: new Date(),
    });
    await tx.insert(drafts).values({
      tenantId,
      id,
      messageId: id,
      status: 'needs_approval',
      originalReply: 'مرحباً 👋',
      evidence,
    });
  });
  return id;
}
async function state(id: string) {
  return withTenant(app, 'qamar', async (tx) => ({
    draft: (await tx.select().from(drafts).where(eq(drafts.id, id)))[0],
    reviews: await tx.select().from(reviews).where(eq(reviews.draftId, id)),
    outbox: await tx
      .select({ id: outbox.id })
      .from(outbox)
      .innerJoin(
        reviews,
        and(eq(reviews.tenantId, outbox.tenantId), eq(reviews.id, outbox.reviewId)),
      )
      .where(eq(reviews.draftId, id)),
  }));
}
async function pgCode(operation: () => Promise<unknown>, code: string) {
  let failure: unknown;
  try {
    await operation();
  } catch (error) {
    failure = error;
  }
  while (failure instanceof Error && 'cause' in failure && failure.cause) failure = failure.cause;
  expect(
    failure && typeof failure === 'object' && 'code' in failure ? failure.code : undefined,
  ).toBe(code);
}
beforeAll(async () => {
  await migrateDatabase(adminUrl);
  await seedDatabase(admin);
  await seedInbox(admin);
}, 30000);
afterAll(async () => {
  // Only remove this run's UUID fixtures, using the guarded test database and owner role.
  for (const tenantId of ['qamar', 'rimal']) {
    const ids = probes.filter((p) => p.tenantId === tenantId).map((p) => p.id);
    if (!ids.length) continue;
    await withTenant(admin, tenantId, async (tx) => {
      const reviewIds = tx
        .select({ id: reviews.id })
        .from(reviews)
        .where(inArray(reviews.draftId, ids));
      await tx.delete(outbox).where(inArray(outbox.reviewId, reviewIds));
      await tx.delete(reviews).where(inArray(reviews.draftId, ids));
      await tx.delete(drafts).where(inArray(drafts.messageId, ids));
      await tx.delete(messages).where(inArray(messages.conversationId, ids));
      await tx.delete(conversations).where(inArray(conversations.id, ids));
    });
  }
  await Promise.all([app.close(), other.close(), admin.close()]);
});

describe('durable inbox with the restricted application role', () => {
  test('loads original messages, isolates businesses and preserves samples when seeded twice', async () => {
    await seedInbox(admin);
    expect((await service.workspace()).tenants.map((t) => t.id)).toEqual(['qamar', 'rimal']);
    const qamar = await service.inbox('qamar');
    const rimal = await service.inbox('rimal');
    expect(qamar?.items).toHaveLength(4);
    expect(rimal?.items).toHaveLength(2);
    expect(qamar?.items.every((i) => i.tenantId === 'qamar')).toBe(true);
    expect(qamar?.items.find((i) => i.sourceEvent === 'evt_0002')?.body).toContain('آيفون');
    const limited = createInboxService(app, ['qamar']);
    expect(await limited.inbox('rimal')).toBeUndefined();
    expect(await limited.review('rimal', 'r-led', input)).toMatchObject({
      ok: false,
      code: 'not_found',
    });
    expect((await limited.workspace()).tenants.map((t) => t.id)).toEqual(['qamar']);
  });

  test('approval persists the named reviewer, Unicode edit and one pending intent across a new pool', async () => {
    const id = await fixture();
    const result = await service.review('qamar', id, input);
    expect(result).toMatchObject({
      ok: true,
      item: {
        status: 'approved',
        revision: 2,
        decision: {
          approverName: 'Aisha K.',
          originalReply: 'مرحباً 👋',
          reply: input.reply,
          editDiff: { start: 7, removed: '👋', added: '🌙' },
        },
        outbox: { status: 'pending' },
      },
    });
    const fresh = createDatabase(appUrl);
    try {
      const stored = (await createInboxService(fresh, ['qamar']).inbox('qamar'))?.items.find(
        (i) => i.id === id,
      );
      expect(stored?.decision?.reply).toBe(input.reply);
      expect(stored?.outbox?.id).toBe(result.ok ? result.item.outbox?.id : undefined);
    } finally {
      await fresh.close();
    }
    await seedInbox(admin);
    expect((await state(id)).draft?.status).toBe('approved');
    expect(await service.review('qamar', id, input)).toMatchObject({ ok: false, code: 'conflict' });
    expect((await state(id)).reviews).toHaveLength(1);
    expect((await state(id)).outbox).toHaveLength(1);
  });

  test('two independent application pools racing to approve produce one winner and one intent', async () => {
    const id = await fixture();
    const results = await Promise.all([
      service.review('qamar', id, input),
      second.review('qamar', id, { ...input, approverId: 'u_rahul' }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, code: 'conflict' });
    expect((await state(id)).reviews).toHaveLength(1);
    expect((await state(id)).outbox).toHaveLength(1);
  });

  test('competing approval and rejection cannot both succeed', async () => {
    const id = await fixture();
    const results = await Promise.all([
      service.review('qamar', id, input),
      second.review('qamar', id, { ...input, action: 'reject', reason: 'Needs correction' }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const saved = await state(id);
    expect(saved.reviews).toHaveLength(1);
    expect(saved.outbox).toHaveLength(saved.reviews[0]?.action === 'approve' ? 1 : 0);
  });

  test('rejection and handoff require a reason and never create an outbox entry', async () => {
    for (const action of ['reject', 'hand_off']) {
      const id = await fixture();
      expect(await service.review('qamar', id, { ...input, action })).toMatchObject({
        ok: false,
        code: 'reason_required',
      });
      expect(
        await service.review('qamar', id, { ...input, action, reason: '  Specialist review  ' }),
      ).toMatchObject({
        ok: true,
        item: { decision: { reason: 'Specialist review' }, outbox: null },
      });
      expect((await state(id)).outbox).toHaveLength(0);
      const review = (await state(id)).reviews[0];
      if (!review) throw new Error('Missing review');
      await pgCode(
        () =>
          withTenant(app, 'qamar', (tx) =>
            tx.insert(outbox).values({ tenantId: 'qamar', id: randomUUID(), reviewId: review.id }),
          ),
        '23503',
      );
    }
  });

  test('invalid fields, another business draft or reviewer make no changes', async () => {
    const id = await fixture();
    const foreign = await fixture('rimal');
    expect(await service.review('qamar', id, { ...input, reply: '   ' })).toMatchObject({
      ok: false,
      code: 'invalid_request',
    });
    expect(await service.review('qamar', foreign, input)).toMatchObject({
      ok: false,
      code: 'not_found',
    });
    expect(await service.review('qamar', id, { ...input, approverId: 'u_faisal' })).toMatchObject({
      ok: false,
      code: 'invalid_approver',
    });
    expect((await state(id)).reviews).toHaveLength(0);
    expect((await state(id)).draft?.revision).toBe(1);
  });

  test('stale record revision, superseded drafts and newer customer messages block approval', async () => {
    const id = await fixture();
    expect(await service.review('qamar', id, { ...input, revision: 2 })).toMatchObject({
      ok: false,
      code: 'conflict',
    });
    expect(await service.review('qamar', 'q-training-old', input)).toMatchObject({
      ok: false,
      code: 'conflict',
    });
    await withTenant(admin, 'qamar', async (tx) => {
      await tx.select().from(conversations).where(eq(conversations.id, id)).for('update');
      await tx.insert(messages).values({
        tenantId: 'qamar',
        id: `${id}-new`,
        conversationId: id,
        sequence: 2,
        channel: 'whatsapp',
        channelMessageId: `${id}-new`,
        sourceEvent: `${id}-new`,
        body: 'Changed quantity',
        receivedAt: new Date(),
      });
      await tx.update(conversations).set({ latestSequence: 2 }).where(eq(conversations.id, id));
    });
    expect(await service.review('qamar', id, input)).toMatchObject({ ok: false, code: 'conflict' });
    expect((await state(id)).reviews).toHaveLength(0);
  });

  test('a newer draft version blocks the previous version even if still marked pending', async () => {
    const id = await fixture();
    await withTenant(admin, 'qamar', (tx) =>
      tx.insert(drafts).values({
        tenantId: 'qamar',
        id: `${id}-v2`,
        messageId: id,
        version: 2,
        status: 'needs_approval',
        originalReply: 'New draft',
        evidence,
      }),
    );
    expect(await service.review('qamar', id, input)).toMatchObject({ ok: false, code: 'conflict' });
  });

  test('a database failure while adding outbox rolls back status, review and edit together', async () => {
    const id = await fixture();
    // UUID-only fixture value. The trigger exists only in the guarded test DB and targets this draft.
    await admin.db.execute(
      sql.raw(
        `CREATE FUNCTION test_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM reviews WHERE tenant_id = NEW.tenant_id AND id = NEW.review_id AND draft_id = '${id}') THEN RAISE EXCEPTION 'Intentional outbox failure'; END IF; RETURN NEW; END $$`,
      ),
    );
    await admin.db.execute(
      sql`CREATE TRIGGER test_fail_outbox BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION test_fail_outbox()`,
    );
    try {
      await expect(service.review('qamar', id, input)).rejects.toThrow();
      const saved = await state(id);
      expect(saved.draft).toMatchObject({ status: 'needs_approval', revision: 1 });
      expect(saved.reviews).toHaveLength(0);
      expect(saved.outbox).toHaveLength(0);
    } finally {
      await admin.db.execute(sql`DROP TRIGGER test_fail_outbox ON outbox`);
      await admin.db.execute(sql`DROP FUNCTION test_fail_outbox()`);
    }
    expect(await service.review('qamar', id, input)).toMatchObject({ ok: true });
  });

  test('database deduplicates redeliveries by tenant, channel and provider message ID', async () => {
    const id = await fixture();
    await pgCode(
      () =>
        withTenant(admin, 'qamar', (tx) =>
          tx.insert(messages).values({
            tenantId: 'qamar',
            id: randomUUID(),
            conversationId: id,
            sequence: 2,
            channel: 'whatsapp',
            channelMessageId: id,
            sourceEvent: 'redelivery',
            body: 'A redelivered copy',
            receivedAt: new Date(),
          }),
        ),
      '23505',
    );
    const stored = await withTenant(app, 'qamar', (tx) =>
      tx.select().from(messages).where(eq(messages.conversationId, id)),
    );
    expect(stored).toHaveLength(1);
  });

  test('RLS protects all workflow tables without filters; application cannot rewrite review history', async () => {
    const id = await fixture();
    await service.review('qamar', id, input);
    for (const table of [conversations, messages, drafts, reviews, outbox]) {
      expect(await app.db.select().from(table)).toEqual([]);
      const rows = await withTenant(app, 'rimal', (tx) => tx.select().from(table));
      expect(rows.every((row) => row.tenantId === 'rimal')).toBe(true);
    }
    await pgCode(
      () => withTenant(app, 'qamar', (tx) => tx.update(reviews).set({ reply: 'Tampered' })),
      '42501',
    );
    await pgCode(() => withTenant(app, 'qamar', (tx) => tx.delete(outbox)), '42501');
    const foreignMessage = await fixture('rimal');
    await pgCode(
      () =>
        withTenant(admin, 'qamar', (tx) =>
          tx.insert(drafts).values({
            tenantId: 'qamar',
            id: randomUUID(),
            messageId: foreignMessage,
            status: 'needs_approval',
            originalReply: 'Invalid foreign reference',
            evidence,
          }),
        ),
      '23503',
    );
    const saved = await state(id);
    const review = saved.reviews[0];
    if (!review) throw new Error('Missing review');
    await pgCode(
      () =>
        withTenant(app, 'qamar', (tx) =>
          tx.insert(outbox).values({ tenantId: 'qamar', id: randomUUID(), reviewId: review.id }),
        ),
      '23505',
    );
  });
});
