import { createDatabase, databaseUrl } from '@trustdesk/db';
import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { DRAFT_QUEUE } from './client.ts';

export async function setupQueue(connectionString: string) {
  const boss = new PgBoss({
    connectionString,
    schema: 'pgboss',
    supervise: false,
    schedule: false,
  });
  boss.on('error', () => console.error('Queue setup failed.'));
  const database = createDatabase(connectionString, { max: 1 });
  try {
    await boss.start();
    await boss.createQueue(DRAFT_QUEUE, {
      retryLimit: 0,
      expireInSeconds: 90,
      retentionSeconds: 604800,
      partition: false,
    });
    await database.db.execute(sql`GRANT USAGE ON SCHEMA pgboss TO trustdesk_app`);
    await database.db.execute(
      sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO trustdesk_app`,
    );
    await database.db.execute(
      sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO trustdesk_app`,
    );
  } finally {
    await boss.stop();
    await database.close();
  }
}
if (import.meta.main) {
  await setupQueue(databaseUrl('DATABASE_ADMIN_URL'));
  console.log('pg-boss schema and the enquiry queue are ready.');
}
