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

const url = databaseUrl('DATABASE_URL');
const database = createDatabase(url);
const allowedTenantIds = ['qamar', 'rimal'] as const;
// Synthetic local operator. Never resolve authorization from the customer body or URL alone.
const inbox = createInboxService(database, allowedTenantIds);
const provider = process.env.OPENAI_API_KEY
  ? createOpenAIProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL)
  : undefined;
const drafting = createDraftingService(database, allowedTenantIds, provider);
const queue = queueClient(url);
await queue.start();
const receive = createReceiveService(database, allowedTenantIds, draftPublisher(queue));
const model = provider?.model ?? process.env.OPENAI_MODEL;
const quality = createQualityService(database, allowedTenantIds, model);
const activity = createActivityService(database, allowedTenantIds);
const settings = createSettingsService(database, allowedTenantIds, model, Boolean(provider));
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
