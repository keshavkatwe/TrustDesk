import {
  createActivityService,
  createDraftingService,
  createInboxService,
  createOpenAIProvider,
  createQualityService,
  createReceiveService,
  createSettingsService,
  draftPublisher,
  queueClient,
} from '@trustdesk/core';
import { createDatabase, databaseUrl } from '@trustdesk/db';
import { createApp } from './app.ts';

const port = Number(process.env.API_PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be an integer between 1 and 65535.');
}

const database = createDatabase(databaseUrl('DATABASE_URL'));
// Synthetic local operator. Never resolve authorization from the customer body or URL alone.
const inbox = createInboxService(database, ['qamar', 'rimal']);
const provider = process.env.OPENAI_API_KEY
  ? createOpenAIProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL)
  : undefined;
const drafting = createDraftingService(database, ['qamar', 'rimal'], provider);
const queue = queueClient(databaseUrl('DATABASE_URL'));
await queue.start();
const receive = createReceiveService(database, ['qamar', 'rimal'], draftPublisher(queue));
const quality = createQualityService(
  database,
  ['qamar', 'rimal'],
  provider?.model ?? process.env.OPENAI_MODEL,
);
const activity = createActivityService(database, ['qamar', 'rimal']);
const settings = createSettingsService(
  database,
  ['qamar', 'rimal'],
  provider?.model ?? process.env.OPENAI_MODEL,
  Boolean(provider),
);
const app = createApp({ inbox, drafting, receive, quality, activity, settings }).listen({
  port,
  hostname: '127.0.0.1',
  idleTimeout: 60,
});

console.log(`TrustDesk API: http://localhost:${port}`);
console.log(`OpenAPI: http://localhost:${port}/openapi`);

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    if (app.server) await app.stop();
    await queue.stop();
    await database.close();
    process.exit(0);
  });
}
