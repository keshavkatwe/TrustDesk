import { createInboxService } from '@trustdesk/core';
import { createDatabase, databaseUrl } from '@trustdesk/db';
import { createApp } from './app.ts';

const port = Number(process.env.API_PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('API_PORT must be an integer between 1 and 65535.');
}

const database = createDatabase(databaseUrl('DATABASE_URL'));
// Synthetic local operator. Never resolve authorization from the customer body or URL alone.
const inbox = createInboxService(database, ['qamar', 'rimal']);
const app = createApp(inbox).listen({ port, hostname: '127.0.0.1' });

console.log(`TrustDesk API: http://localhost:${port}`);
console.log(`OpenAPI: http://localhost:${port}/openapi`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.stop();
    await database.close();
    process.exit(0);
  });
}
