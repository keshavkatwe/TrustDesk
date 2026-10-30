import { z } from 'zod';

export const ConnectionUrl = z.url().refine((value) => {
  const url = new URL(value);
  return ['postgres:', 'postgresql:'].includes(url.protocol) && url.pathname.length > 1;
});

// These credentials belong only to the loopback-bound Compose development database.
const localUrls = {
  DATABASE_URL: 'postgres://trustdesk_app:trustdesk_local_app@127.0.0.1:5433/trustdesk',
  DATABASE_ADMIN_URL:
    'postgres://trustdesk_migrator:trustdesk_local_migrator@127.0.0.1:5433/trustdesk',
  DATABASE_TEST_URL: 'postgres://trustdesk_app:trustdesk_local_app@127.0.0.1:5433/trustdesk_test',
  DATABASE_TEST_ADMIN_URL:
    'postgres://trustdesk_migrator:trustdesk_local_migrator@127.0.0.1:5433/trustdesk_test',
} as const;

export function databaseUrl(name: keyof typeof localUrls) {
  const parsed = ConnectionUrl.safeParse(process.env[name] ?? localUrls[name]);
  if (!parsed.success) throw new Error(`${name} must be a PostgreSQL URL with a database name.`);
  return parsed.data;
}
