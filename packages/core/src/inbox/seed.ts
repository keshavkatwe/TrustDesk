import { createHash } from 'node:crypto';
import {
  conversations,
  createDatabase,
  type Database,
  databaseUrl,
  drafts,
  messages,
  receivingChannels,
  withTenant,
} from '@trustdesk/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DraftEvidence, Inbox } from './model.ts';

const SourceEvent = z.object({
  event_id: z.string(),
  channel: z.enum(['whatsapp', 'email', 'webform']),
  to: z.string(),
  from: z.string(),
  message_id: z.string(),
  received_at: z.iso.datetime({ offset: true }),
  text: z.string(),
});

export async function seedInbox(database: Database) {
  const raw: unknown = await Bun.file(
    new URL('../../../../seed/inbox-scenarios.json', import.meta.url),
  ).json();
  const scenarios = Inbox.parse({
    items: z
      .object({ items: z.array(z.record(z.string(), z.unknown())) })
      .parse(raw)
      .items.map((item) => ({ ...item, outbox: null })),
  });
  const events = (await Bun.file(new URL('../../../../seed/events.jsonl', import.meta.url)).text())
    .trim()
    .split('\n')
    .map((line) => SourceEvent.parse(JSON.parse(line)));
  for (const tenantId of ['qamar', 'rimal']) {
    const source = scenarios.items
      .filter((item) => item.tenantId === tenantId)
      .map((item) => {
        const event = events.find((event) => event.event_id === item.sourceEvent);
        if (!event) throw new Error(`Missing original event ${item.sourceEvent}.`);
        const conversationId = `sample-${createHash('sha256').update(`${tenantId}:${event.channel}:${event.from}`).digest('hex')}`;
        return { item, event, conversationId };
      })
      .sort((a, b) => Date.parse(a.event.received_at) - Date.parse(b.event.received_at));
    await withTenant(database, tenantId, async (tx) => {
      for (const entry of source) {
        const { item, event, conversationId } = entry;
        const [mapping] = await tx
          .select()
          .from(receivingChannels)
          .where(
            and(
              eq(receivingChannels.tenantId, tenantId),
              eq(receivingChannels.channel, event.channel),
              eq(receivingChannels.address, event.to),
            ),
          );
        if (!mapping)
          throw new Error(`Event ${event.event_id} does not belong to its seeded business.`);
        const conversationMessages = source.filter(
          (entry) => entry.conversationId === conversationId,
        );
        const sequence = conversationMessages.indexOf(entry) + 1;
        await tx
          .insert(conversations)
          .values({
            tenantId,
            id: conversationId,
            channel: event.channel,
            customer: event.from,
            latestSequence: conversationMessages.length,
          })
          .onConflictDoNothing();
        await tx
          .insert(messages)
          .values({
            tenantId,
            id: event.event_id,
            conversationId,
            sequence,
            channel: event.channel,
            channelMessageId: event.message_id,
            sourceEvent: event.event_id,
            body: event.text,
            receivedAt: new Date(event.received_at),
          })
          .onConflictDoNothing();
        await tx
          .insert(drafts)
          .values({
            tenantId,
            id: item.id,
            messageId: event.event_id,
            revision: item.revision,
            status: item.status,
            originalReply: item.draftReply,
            evidence: DraftEvidence.parse(item),
          })
          .onConflictDoNothing();
      }
    });
  }
}

if (import.meta.main) {
  const database = createDatabase(databaseUrl('DATABASE_ADMIN_URL'), { max: 1 });
  try {
    await seedInbox(database);
    console.log(
      'Seeded 6 persistent sample drafts and their original customer messages. Existing decisions were preserved.',
    );
  } finally {
    await database.close();
  }
}
