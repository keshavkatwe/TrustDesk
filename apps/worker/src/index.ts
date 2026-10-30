import { createOpenAIProvider, startWorker } from '@trustdesk/core';
import { createDatabase, databaseUrl } from '@trustdesk/db';

const url = databaseUrl('DATABASE_URL');
const database = createDatabase(url);
const provider = process.env.OPENAI_API_KEY
  ? createOpenAIProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL)
  : undefined;
const worker = await startWorker(database, url, ['qamar', 'rimal'], provider);
console.log('TrustDesk worker ready: incoming drafts and simulated dispatch.');
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await worker.stop();
    await database.close();
    process.exit(0);
  });
