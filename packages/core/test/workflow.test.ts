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
  tenants,
  withTenant,
} from '@trustdesk/db';
import { and, eq, inArray } from 'drizzle-orm';
import { migrateDatabase } from '../../db/src/migrate.ts';
import { seedDatabase } from '../../db/src/seed.ts';
import { DEFAULT_MODEL, type DraftProvider } from '../src/ai/model.ts';
import { createDraftingService } from '../src/ai/service.ts';
import { createDispatchService } from '../src/dispatch/service.ts';
import { createInboxService } from '../src/inbox/service.ts';
import { draftPublisher, queueClient } from '../src/queue/client.ts';
import { recoverStalledWork } from '../src/queue/recovery.ts';
import { setupQueue } from '../src/queue/setup.ts';
import { startWorker } from '../src/queue/worker.ts';
import { createReceiveService } from '../src/receive/service.ts';

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
  throw new Error('Workflow tests require matching *_test databases and separate roles.');
const app = createDatabase(appUrl),
  other = createDatabase(appUrl),
  admin = createDatabase(adminUrl);
const boss = queueClient(appUrl);
const jobIds: string[] = [],
  customerIds: string[] = [];
const enqueue: ReturnType<typeof draftPublisher> = async (tx, job) => {
  const id = await draftPublisher(boss)(tx, job);
  if (typeof id === 'string') jobIds.push(id);
  return id;
};
const receive = createReceiveService(app, ['qamar', 'rimal'], enqueue),
  inbox = createInboxService(app, ['qamar', 'rimal']),
  dispatch = createDispatchService(app, ['qamar', 'rimal']);
const request = {
  intent: 'quote',
  language: 'English',
  lines: [
    {
      sku: 'Q-PHN-001',
      description: 'iPhone 16',
      quantity: '2',
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
};
let paidCalls = 0;
const provider: DraftProvider = {
  model: DEFAULT_MODEL,
  generate: async () => {
    paidCalls++;
    return {
      text: JSON.stringify({ title: 'Two phones for collection', request }),
      responseId: 'workflow-mock',
      model: DEFAULT_MODEL,
      errorCode: null,
      usage: {
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 100,
        estimatedCostUsd: '0.000525000',
      },
    };
  },
};
function event() {
  const id = `workflow-${randomUUID()}`;
  customerIds.push(id);
  return {
    event_id: id,
    channel: 'whatsapp' as const,
    to: '+971 4 000 0101',
    from: id,
    message_id: id,
    received_at: new Date().toISOString(),
    text: 'Can I buy 2 iPhone 16 phones in Dubai? We will collect.',
  };
}
async function item(id: string) {
  return (await inbox.inbox('qamar'))?.items.find((i) => i.id === id);
}
async function approve(id: string) {
  const current = await item(id);
  if (!current) throw new Error('Missing current draft');
  return inbox.review('qamar', id, {
    approverId: 'u_aisha',
    action: 'approve',
    revision: current.revision,
    reply: current.draftReply,
    reason: '',
  });
}
async function waitUntil(check: () => Promise<boolean>) {
  const limit = Date.now() + 10000;
  while (Date.now() < limit) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Workflow did not reach its expected state.');
}
beforeAll(async () => {
  await migrateDatabase(adminUrl);
  await seedDatabase(admin);
  await setupQueue(adminUrl);
  await boss.start();
}, 30000);
afterAll(async () => {
  for (const id of jobIds) await boss.deleteJob('enquiry-draft', id);
  for (const tenantId of ['qamar', 'rimal'])
    await withTenant(admin, tenantId, async (tx) => {
      const cs = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(inArray(conversations.customer, customerIds));
      if (!cs.length) return;
      const ms = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          inArray(
            messages.conversationId,
            cs.map((x) => x.id),
          ),
        );
      const ds = await tx
        .select({ id: drafts.id })
        .from(drafts)
        .where(
          inArray(
            drafts.messageId,
            ms.map((x) => x.id),
          ),
        );
      const rs = await tx
        .select({ id: reviews.id })
        .from(reviews)
        .where(
          inArray(
            reviews.draftId,
            ds.map((x) => x.id),
          ),
        );
      const os = await tx
        .select({ id: outbox.id })
        .from(outbox)
        .where(
          inArray(
            outbox.reviewId,
            rs.map((x) => x.id),
          ),
        );
      if (os.length)
        await tx.delete(deliveries).where(
          inArray(
            deliveries.outboxId,
            os.map((x) => x.id),
          ),
        );
      if (rs.length) {
        await tx.delete(outbox).where(
          inArray(
            outbox.reviewId,
            rs.map((x) => x.id),
          ),
        );
        await tx.delete(reviews).where(
          inArray(
            reviews.id,
            rs.map((x) => x.id),
          ),
        );
      }
      await tx.delete(aiRuns).where(
        inArray(
          aiRuns.messageId,
          ms.map((x) => x.id),
        ),
      );
      await tx.delete(eventReceipts).where(
        inArray(
          eventReceipts.messageId,
          ms.map((x) => x.id),
        ),
      );
      await tx.delete(drafts).where(
        inArray(
          drafts.id,
          ds.map((x) => x.id),
        ),
      );
      await tx.delete(messages).where(
        inArray(
          messages.id,
          ms.map((x) => x.id),
        ),
      );
      await tx.delete(conversations).where(
        inArray(
          conversations.id,
          cs.map((x) => x.id),
        ),
      );
    });
  await boss.stop();
  await Promise.all([app.close(), other.close(), admin.close()]);
});
test('competing deliveries save separate receipts, one message and one atomic pg-boss job', async () => {
  const input = event();
  const before = jobIds.length;
  const results = await Promise.all([
    receive.receive(input),
    createReceiveService(other, ['qamar'], enqueue).receive({
      ...input,
      event_id: `${input.event_id}-duplicate`,
    }),
  ]);
  expect(results.filter((r) => r.ok && r.outcome === 'accepted')).toHaveLength(1);
  expect(results.filter((r) => r.ok && r.outcome === 'duplicate')).toHaveLength(1);
  expect(jobIds.length - before).toBe(1);
  const stored = await withTenant(app, 'qamar', async (tx) => ({
    messages: await tx
      .select()
      .from(messages)
      .where(eq(messages.channelMessageId, input.message_id)),
    receipts: await tx
      .select()
      .from(eventReceipts)
      .where(inArray(eventReceipts.eventId, [input.event_id, `${input.event_id}-duplicate`])),
  }));
  expect(stored.messages).toHaveLength(1);
  expect(stored.receipts).toHaveLength(2);
  expect(
    await receive.receive({ ...input, text: 'A changed body under the same ID' }),
  ).toMatchObject({ ok: false, code: 'message_conflict' });
  expect(await receive.receive({ ...input, from: `${input.from}-different-sender` })).toMatchObject(
    { ok: false, code: 'message_conflict' },
  );
  const receipts = await withTenant(app, 'qamar', (tx) =>
    tx.query.eventReceipts.findMany({
      columns: { outcome: true, messageId: true },
      where: (receipt, { and, eq, inArray }) =>
        and(
          eq(receipt.tenantId, 'qamar'),
          inArray(receipt.eventId, [input.event_id, `${input.event_id}-duplicate`]),
        ),
    }),
  );
  expect(receipts.map((receipt) => receipt.outcome).sort()).toEqual([
    'accepted',
    'conflict',
    'conflict',
    'duplicate',
  ]);
  expect(new Set(receipts.map((receipt) => receipt.messageId)).size).toBe(1);
  expect(jobIds.length - before).toBe(1);
});
test('destination mapping wins over forged tenant metadata; unknown or forbidden destinations fail closed', async () => {
  const input = event();
  expect(
    await receive.receive({ ...input, to: '+966 11 000 0202', metadata: { tenant_id: 'qamar' } }),
  ).toMatchObject({ ok: true, tenantId: 'rimal' });
  expect(
    await createReceiveService(app, ['qamar'], enqueue).receive({
      ...event(),
      to: '+966 11 000 0202',
    }),
  ).toMatchObject({ ok: false, code: 'unknown_destination' });
  expect(await receive.receive({ ...event(), to: 'unknown' })).toMatchObject({
    ok: false,
    code: 'unknown_destination',
  });
  expect(await receive.receive({ ...event(), received_at: 'bad date' })).toMatchObject({
    ok: false,
    code: 'invalid_request',
  });
  expect(await app.db.select().from(eventReceipts)).toEqual([]);
  expect(await app.db.select().from(deliveries)).toEqual([]);
});
test('a failure after queue insertion rolls back receipt, message, draft and job together', async () => {
  const input = event();
  const before = jobIds.length;
  const broken = createReceiveService(app, ['qamar'], async (tx, job) => {
    await enqueue(tx, job);
    throw new Error('Intentional enqueue rollback');
  });
  await expect(broken.receive(input)).rejects.toThrow('Intentional');
  expect(
    await withTenant(app, 'qamar', (tx) =>
      tx.select().from(messages).where(eq(messages.channelMessageId, input.message_id)),
    ),
  ).toEqual([]);
  expect(
    await withTenant(app, 'qamar', (tx) =>
      tx.select().from(eventReceipts).where(eq(eventReceipts.eventId, input.event_id)),
    ),
  ).toEqual([]);
  const queued = jobIds[before];
  if (!queued) throw new Error('Queue was not exercised');
  expect(await boss.getJobById('enquiry-draft', queued)).toBeNull();
});
test('four different messages from the same customer and channel continue one conversation', async () => {
  const input = event();
  const firstJob = jobIds.length;
  try {
    const texts = [
      input.text,
      'Actually make that 3 phones.',
      'We are in JLT.',
      'We will collect tomorrow.',
    ];
    const messageIds = new Set<string>();
    for (const [index, text] of texts.entries()) {
      const received = await receive.receive({
        ...input,
        event_id: `${input.event_id}-${index}`,
        message_id: `${input.message_id}-${index}`,
        text,
      });
      if (!received.ok) throw new Error('Receive failed');
      expect(received.outcome).toBe('accepted');
      messageIds.add(received.messageId);
    }
    const stored = await withTenant(app, 'qamar', (tx) =>
      tx.query.conversations.findMany({
        where: (conversation, { and, eq }) =>
          and(
            eq(conversation.tenantId, 'qamar'),
            eq(conversation.channel, input.channel),
            eq(conversation.customer, input.from),
          ),
        with: {
          messages: {
            columns: { sequence: true, body: true },
            orderBy: (message, { asc }) => [asc(message.sequence)],
          },
        },
      }),
    );
    expect(messageIds.size).toBe(4);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.latestSequence).toBe(4);
    expect(stored[0]?.messages).toEqual(
      texts.map((body, index) => ({ sequence: index + 1, body })),
    );
  } finally {
    for (const id of jobIds.slice(firstJob)) await boss.deleteJob('enquiry-draft', id);
  }
});
test('a customer correction supersedes the old draft and prevents dispatch of a previously approved reply', async () => {
  const input = event();
  const first = await receive.receive(input);
  if (!first.ok) throw new Error('Receive failed');
  const generated = await createDraftingService(app, ['qamar'], provider).generate(
    'qamar',
    first.draftId,
    { revision: 1 },
  );
  if (!generated.ok) throw new Error('Generate failed');
  const approved = await approve(generated.id);
  if (!approved.ok || !approved.item.outbox) throw new Error('Approval failed');
  const correction = await receive.receive({
    ...input,
    event_id: `${input.event_id}-2`,
    message_id: `${input.message_id}-2`,
    text: 'Actually make that 3 phones.',
  });
  expect(correction.ok).toBe(true);
  expect(await dispatch.dispatch('qamar', approved.item.outbox.id)).toMatchObject({
    status: 'cancelled',
    simulatedMessageId: null,
  });
  expect(await item(generated.id)).toMatchObject({
    status: 'approved',
    outbox: { status: 'cancelled' },
  });
});
test('unreviewed corrections supersede old versions before a worker can spend on them', async () => {
  const input = event(),
    first = await receive.receive(input);
  if (!first.ok) throw new Error('Receive failed');
  const second = await receive.receive({
    ...input,
    event_id: `input-${randomUUID()}`,
    message_id: `message-${randomUUID()}`,
    text: 'Actually 3 phones.',
  });
  if (!second.ok) throw new Error('Correction failed');
  const before = paidCalls;
  expect(
    await createDraftingService(app, ['qamar'], provider).generate('qamar', first.draftId, {
      revision: 1,
    }),
  ).toMatchObject({ ok: false, code: 'conflict' });
  expect(paidCalls).toBe(before);
  expect(await item(first.draftId)).toMatchObject({
    status: 'superseded',
    supersededBy: second.draftId,
  });
});
test('concurrent simulated dispatch records exactly one immutable delivery and uses approved edited wording', async () => {
  const accepted = await receive.receive(event());
  if (!accepted.ok) throw new Error('Receive failed');
  const generated = await createDraftingService(app, ['qamar'], provider).generate(
    'qamar',
    accepted.draftId,
    { revision: 1 },
  );
  if (!generated.ok) throw new Error('Generate failed');
  const current = await item(generated.id);
  if (!current) throw new Error('Missing draft');
  const edited = `${current.draftReply} Please confirm your contact person.`;
  const approved = await inbox.review('qamar', generated.id, {
    approverId: 'u_aisha',
    action: 'approve',
    revision: 1,
    reply: edited,
    reason: '',
  });
  if (!approved.ok || !approved.item.outbox) throw new Error('Approval failed');
  const results = await Promise.all([
    dispatch.dispatch('qamar', approved.item.outbox.id),
    createDispatchService(other, ['qamar']).dispatch('qamar', approved.item.outbox.id),
  ]);
  expect(results[0]?.simulatedMessageId).toBe(results[1]?.simulatedMessageId);
  expect(results[0]).toMatchObject({ status: 'simulated_sent', reply: edited });
  expect(
    await createDispatchService(other, ['rimal']).dispatch('qamar', approved.item.outbox.id),
  ).toBeUndefined();
  const intentId = approved.item.outbox.id;
  const saved = await withTenant(app, 'qamar', (tx) =>
    tx.select().from(deliveries).where(eq(deliveries.outboxId, intentId)),
  );
  expect(saved).toHaveLength(1);
});
test('real pg-boss worker takes an incoming enquiry through AI, human approval and simulated delivery', async () => {
  const accepted = await receive.receive(event());
  if (!accepted.ok) throw new Error('Receive failed');
  const worker = await startWorker(other, appUrl, ['qamar', 'rimal'], provider);
  try {
    let nextId = '';
    const source = await item(accepted.draftId);
    await waitUntil(async () => {
      const current = (await inbox.inbox('qamar'))?.items.find(
        (i) => i.sourceEvent === source?.sourceEvent && i.provenance === 'openai',
      );
      nextId = current?.id ?? '';
      return Boolean(nextId);
    });
    expect(await item(nextId)).toMatchObject({
      processingState: 'ready',
      status: 'needs_approval',
      quote: { totalMinor: 713790 },
    });
    const result = await approve(nextId);
    expect(result.ok).toBe(true);
    await waitUntil(async () => (await item(nextId))?.outbox?.status === 'simulated_sent');
    expect((await item(nextId))?.outbox?.simulatedMessageId).toMatch(/^sim-/);
  } finally {
    await worker.stop();
  }
}, 15000);

test('dispatch cancels approval if business pricing changes before sending', async () => {
  const accepted = await receive.receive(event());
  if (!accepted.ok) throw new Error('Receive failed');
  const generated = await createDraftingService(app, ['qamar'], provider).generate(
    'qamar',
    accepted.draftId,
    { revision: 1 },
  );
  if (!generated.ok) throw new Error('Generate failed');
  const approved = await approve(generated.id);
  if (!approved.ok || !approved.item.outbox) throw new Error('Approval failed');
  const [before] = await withTenant(admin, 'qamar', (tx) =>
    tx.select().from(tenants).where(eq(tenants.id, 'qamar')),
  );
  if (!before) throw new Error('Missing business');
  try {
    await withTenant(admin, 'qamar', (tx) =>
      tx
        .update(tenants)
        .set({ vatBasisPoints: before.vatBasisPoints + 1 })
        .where(eq(tenants.id, 'qamar')),
    );
    expect(await dispatch.dispatch('qamar', approved.item.outbox.id)).toMatchObject({
      status: 'cancelled',
      reason: 'Pricing or policy changed after approval.',
    });
  } finally {
    await withTenant(admin, 'qamar', (tx) =>
      tx
        .update(tenants)
        .set({ vatBasisPoints: before.vatBasisPoints })
        .where(eq(tenants.id, 'qamar')),
    );
  }
});

test('a worker without a provider records a visible failure and never creates send intent', async () => {
  const accepted = await receive.receive(event());
  if (!accepted.ok) throw new Error('Receive failed');
  const worker = await startWorker(other, appUrl, ['qamar', 'rimal']);
  try {
    await waitUntil(async () => (await item(accepted.draftId))?.processingState === 'failed');
    expect(await item(accepted.draftId)).toMatchObject({
      status: 'needs_approval',
      provenance: 'received',
      outbox: null,
      assessment: null,
    });
    const retry = await createDraftingService(app, ['qamar'], provider).generate(
      'qamar',
      accepted.draftId,
      { revision: 1 },
    );
    expect(retry.ok).toBe(true);
  } finally {
    await worker.stop();
  }
}, 15000);

test('recovery fails stalled work while preserving active attempts and another business', async () => {
  const firstJob = jobIds.length;
  const abandoned = await receive.receive(event());
  const expired = await receive.receive(event());
  const active = await receive.receive(event());
  const foreign = await receive.receive({ ...event(), to: '+966 11 000 0202' });
  if (!abandoned.ok || !expired.ok || !active.ok || !foreign.ok) throw new Error('Receive failed');
  try {
    const old = new Date(Date.now() - 100000);
    await withTenant(admin, 'qamar', async (tx) => {
      await tx
        .update(drafts)
        .set({ createdAt: old })
        .where(and(eq(drafts.tenantId, 'qamar'), eq(drafts.id, abandoned.draftId)));
      await tx
        .update(messages)
        .set({ processingState: 'processing' })
        .where(
          and(
            eq(messages.tenantId, 'qamar'),
            inArray(messages.id, [expired.messageId, active.messageId]),
          ),
        );
      await tx.insert(aiRuns).values(
        [expired, active].map((source) => ({
          tenantId: 'qamar',
          id: randomUUID(),
          messageId: source.messageId,
          sourceDraftId: source.draftId,
          sourceRevision: 1,
          model: DEFAULT_MODEL,
          promptVersion: 'recovery-test',
          inputHash: 'b'.repeat(64),
          status: 'running' as const,
          createdAt: source === expired ? old : new Date(),
        })),
      );
    });
    await withTenant(admin, 'rimal', (tx) =>
      tx
        .update(drafts)
        .set({ createdAt: old })
        .where(and(eq(drafts.tenantId, 'rimal'), eq(drafts.id, foreign.draftId))),
    );
    const callsBefore = paidCalls;
    const jobsBefore = jobIds.length;
    await recoverStalledWork(app, 'qamar');
    expect(await item(abandoned.draftId)).toMatchObject({ processingState: 'failed' });
    expect(await item(expired.draftId)).toMatchObject({ processingState: 'failed' });
    expect(await item(active.draftId)).toMatchObject({ processingState: 'processing' });
    const attempts = await withTenant(app, 'qamar', (tx) =>
      tx.query.aiRuns.findMany({
        columns: { messageId: true, status: true, errorCode: true },
        where: (run, { and, eq, inArray }) =>
          and(
            eq(run.tenantId, 'qamar'),
            inArray(run.messageId, [expired.messageId, active.messageId]),
          ),
      }),
    );
    expect(attempts.find((run) => run.messageId === expired.messageId)).toMatchObject({
      status: 'failed',
      errorCode: 'interrupted',
    });
    expect(attempts.find((run) => run.messageId === active.messageId)).toMatchObject({
      status: 'running',
      errorCode: null,
    });
    const otherMessage = await withTenant(app, 'rimal', (tx) =>
      tx.query.messages.findFirst({
        columns: { processingState: true },
        where: (message, { and, eq }) =>
          and(eq(message.tenantId, 'rimal'), eq(message.id, foreign.messageId)),
      }),
    );
    expect(otherMessage?.processingState).toBe('queued');
    expect(paidCalls).toBe(callsBefore);
    expect(jobIds.length).toBe(jobsBefore);
  } finally {
    for (const id of jobIds.slice(firstJob)) await boss.deleteJob('enquiry-draft', id);
  }
});

test('outbox recovery excludes recorded results before applying the 25-item batch limit', async () => {
  const accepted = await receive.receive(event());
  if (!accepted.ok) throw new Error('Receive failed');
  const entries = Array.from({ length: 60 }, (_, index) => ({
    draftId: randomUUID(),
    reviewId: randomUUID(),
    outboxId: randomUUID(),
    version: index + 2,
  }));
  const intentIds = entries.map((entry) => entry.outboxId);
  try {
    await withTenant(app, 'qamar', async (tx) => {
      const source = await tx.query.drafts.findFirst({
        columns: { evidence: true },
        where: (draft, { eq }) => eq(draft.id, accepted.draftId),
      });
      if (!source) throw new Error('Missing recovery fixture');
      await tx.insert(drafts).values(
        entries.map((entry) => ({
          tenantId: 'qamar',
          id: entry.draftId,
          messageId: accepted.messageId,
          version: entry.version,
          status: 'approved' as const,
          originalReply: 'Recovery fixture',
          evidence: source.evidence,
        })),
      );
      await tx.insert(reviews).values(
        entries.map((entry) => ({
          tenantId: 'qamar',
          id: entry.reviewId,
          draftId: entry.draftId,
          draftRevision: 1,
          approverId: 'u_aisha',
          approverName: 'Aisha K.',
          action: 'approve' as const,
          originalReply: 'Recovery fixture',
          reply: 'Recovery fixture',
          reason: '',
          editDiff: [],
        })),
      );
      await tx.insert(outbox).values(
        entries.map((entry) => ({
          tenantId: 'qamar',
          id: entry.outboxId,
          reviewId: entry.reviewId,
        })),
      );
      await tx.insert(deliveries).values(
        entries.slice(0, 30).map((entry) => ({
          tenantId: 'qamar',
          outboxId: entry.outboxId,
          status: 'cancelled' as const,
          reason: 'Previously processed fixture',
          reply: 'Recovery fixture',
          destination: 'test-only',
        })),
      );
    });
    const unprocessed = new Set<string>(entries.slice(30).map((entry) => entry.outboxId));
    const pending = await dispatch.pending('qamar');
    expect(pending).toHaveLength(25);
    expect(pending.every((intent) => unprocessed.has(intent.id))).toBe(true);
    expect(await createDispatchService(app, ['rimal']).pending('qamar')).toEqual([]);
  } finally {
    await withTenant(admin, 'qamar', async (tx) => {
      await tx.delete(deliveries).where(inArray(deliveries.outboxId, intentIds));
      await tx.delete(outbox).where(inArray(outbox.id, intentIds));
      await tx.delete(reviews).where(
        inArray(
          reviews.id,
          entries.map((entry) => entry.reviewId),
        ),
      );
      await tx.delete(drafts).where(
        inArray(
          drafts.id,
          entries.map((entry) => entry.draftId),
        ),
      );
    });
  }
});
