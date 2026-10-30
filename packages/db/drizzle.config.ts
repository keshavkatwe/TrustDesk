import { defineConfig } from 'drizzle-kit';
import { databaseUrl } from './src/config.ts';

// Studio uses the restricted application role, with one explicit tenant per session.
const tenantId = process.env.STUDIO_TENANT_ID ?? 'qamar';
if (!['qamar', 'rimal'].includes(tenantId)) {
  throw new Error('STUDIO_TENANT_ID must be qamar or rimal.');
}
const url = new URL(databaseUrl('DATABASE_URL'));
url.searchParams.set(
  'options',
  [url.searchParams.get('options'), `-c app.tenant_id=${tenantId}`].filter(Boolean).join(' '),
);

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  strict: true,
  dbCredentials: { url: url.toString() },
});
