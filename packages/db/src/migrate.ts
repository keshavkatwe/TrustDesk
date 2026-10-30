import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client.ts';
import { databaseUrl } from './config.ts';

export async function migrateDatabase(connectionString: string) {
  const database = createDatabase(connectionString, { max: 1 });
  try {
    await migrate(database.db, {
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
  } finally {
    await database.close();
  }
}

if (import.meta.main) {
  await migrateDatabase(databaseUrl('DATABASE_ADMIN_URL'));
  console.log('Database migrations applied.');
}
