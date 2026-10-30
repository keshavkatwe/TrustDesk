import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';
import { ConnectionUrl } from './config.ts';
import * as schema from './schema.ts';

const Options = z.object({
  connectionString: ConnectionUrl,
  max: z.number().int().min(1).max(50),
});
const TenantId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);

// No connections are created at import time. Call once per running API/worker process.
export function createDatabase(connectionString: string, options: { max?: number } = {}) {
  const config = Options.parse({ connectionString, max: options.max ?? 10 });
  const pool = new Pool({ ...config, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
  pool.on('error', () => console.error('An idle PostgreSQL connection failed.'));
  return { db: drizzle(pool, { schema }), pool, close: () => pool.end() };
}

export type Database = ReturnType<typeof createDatabase>;
export type TenantTransaction = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

// The caller supplies a tenant resolved from a trusted adapter/identity, not customer text.
// Transaction-local configuration is cleared on both commit and rollback before pool reuse.
export function withTenant<T>(
  database: Database,
  tenantId: string,
  operation: (transaction: TenantTransaction) => Promise<T>,
) {
  const validatedId = TenantId.parse(tenantId);
  return database.db.transaction(async (transaction) => {
    await transaction.execute(sql`select set_config('app.tenant_id', ${validatedId}, true)`);
    return operation(transaction);
  });
}
