import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { createDatabase, databaseUrl, settingsChanges, tenants, withTenant } from '@trustdesk/db';
import { eq, like } from 'drizzle-orm';
import { migrateDatabase } from '../../db/src/migrate.ts';
import { seedDatabase } from '../../db/src/seed.ts';
import { loadPricingContext } from '../src/pricing/context.ts';
import { createSettingsService } from '../src/settings/service.ts';

const appUrl = databaseUrl('DATABASE_TEST_URL'),
  adminUrl = databaseUrl('DATABASE_TEST_ADMIN_URL');
const a = new URL(appUrl),
  b = new URL(adminUrl);
if (
  !a.pathname.endsWith('_test') ||
  a.host !== b.host ||
  a.pathname !== b.pathname ||
  a.username === b.username
)
  throw new Error('Settings tests need matching *_test databases and separate roles.');
const app = createDatabase(appUrl),
  admin = createDatabase(adminUrl);
const service = createSettingsService(app, ['qamar', 'rimal'], 'test-model', false);
const tag = `settings-test-${randomUUID()}`;
let original: typeof tenants.$inferSelect;
beforeAll(async () => {
  await migrateDatabase(adminUrl);
  await seedDatabase(admin);
  const stored = await withTenant(admin, 'qamar', (tx) =>
    tx.query.tenants.findFirst({ where: (t, { eq }) => eq(t.id, 'qamar') }),
  );
  if (!stored) throw new Error('Required test business is missing.');
  original = stored;
}, 30000);
afterAll(async () => {
  await withTenant(admin, 'qamar', async (tx) => {
    await tx.update(tenants).set(original).where(eq(tenants.id, 'qamar'));
    await tx.delete(settingsChanges).where(like(settingsChanges.reason, `${tag}%`));
  });
  await Promise.all([app.close(), admin.close()]);
});
test('settings require business scope and a local approver; Rimal cannot enable auto-send', async () => {
  expect(await createSettingsService(app, []).get('qamar')).toBeUndefined();
  const current = await service.get('qamar');
  if (!current) throw new Error('Required test fixture is missing.');
  expect(current.ai).toMatchObject({
    providerConfigured: false,
    model: 'test-model',
    trust: 'supervised',
  });
  expect(
    await service.update('qamar', {
      version: current.version,
      approverId: 'u_noura',
      reason: tag,
      rules: current.rules,
    }),
  ).toMatchObject({ ok: false, code: 'invalid' });
  const rimal = await service.get('rimal');
  if (!rimal) throw new Error('Required test fixture is missing.');
  expect(
    await service.update('rimal', {
      version: rimal.version,
      approverId: 'u_noura',
      reason: tag,
      rules: { ...rimal.rules, autoSend: 'low_risk_only' },
    }),
  ).toMatchObject({ ok: false, code: 'invalid' });
  expect(await createSettingsService(app, []).update('qamar', {})).toMatchObject({
    ok: false,
    code: 'not_found',
  });
});
test('concurrent editors produce one saved change and one conflict with exact audited amounts', async () => {
  const current = await service.get('qamar');
  if (!current) throw new Error('Required test fixture is missing.');
  const input = {
    version: current.version,
    approverId: 'u_aisha',
    reason: `${tag}-race`,
    rules: { ...current.rules, minimumOrder: '123.45' },
  };
  const results = await Promise.all([
    service.update('qamar', input),
    service.update('qamar', input),
  ]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  expect(results.filter((result) => !result.ok && result.code === 'conflict')).toHaveLength(1);
  const changes = await withTenant(app, 'qamar', (tx) =>
    tx.query.settingsChanges.findMany({ where: (r, { eq }) => eq(r.reason, input.reason) }),
  );
  expect(changes).toHaveLength(1);
  expect(changes[0]?.before).toEqual(current.rules);
  expect(changes[0]?.after).toMatchObject({ minimumOrder: '123.45' });
  expect((await service.get('qamar'))?.rules.minimumOrder).toBe('123.45');
  expect(await app.db.query.settingsChanges.findMany()).toEqual([]);
  expect(
    await withTenant(app, 'rimal', (tx) =>
      tx.query.settingsChanges.findMany({ where: (r, { eq }) => eq(r.reason, input.reason) }),
    ),
  ).toEqual([]);
});
test('no-op saves do not change version and audit history is append-only to runtime', async () => {
  const current = await service.get('qamar');
  if (!current) throw new Error('Required test fixture is missing.');
  expect(
    await service.update('qamar', {
      version: current.version,
      approverId: 'u_aisha',
      reason: `${tag}-noop`,
      rules: { ...current.rules, vatPercent: String(Number(current.rules.vatPercent)) },
    }),
  ).toEqual({ ok: true, changed: false });
  expect((await service.get('qamar'))?.version).toBe(current.version);
  await expect(
    withTenant(app, 'qamar', (tx) =>
      tx.delete(settingsChanges).where(like(settingsChanges.reason, `${tag}%`)),
    ),
  ).rejects.toThrow();
  await expect(
    withTenant(app, 'qamar', (tx) =>
      tx.update(tenants).set({ name: 'Changed identity' }).where(eq(tenants.id, 'qamar')),
    ),
  ).rejects.toThrow();
});
test('an audit insertion failure rolls back the rule update', async () => {
  const current = await service.get('qamar');
  if (!current) throw new Error('Required test fixture is missing.');
  const name = `settings_fail_${randomUUID().replaceAll('-', '')}`;
  const reason = `${tag}-rollback`;
  await admin.pool.query(
    `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected settings audit failure'; END $$`,
  );
  await admin.pool.query(
    `CREATE TRIGGER ${name} BEFORE INSERT ON settings_changes FOR EACH ROW WHEN (NEW.reason = '${reason}') EXECUTE FUNCTION ${name}()`,
  );
  try {
    await expect(
      service.update('qamar', {
        version: current.version,
        approverId: 'u_aisha',
        reason,
        rules: { ...current.rules, minimumOrder: '999.99' },
      }),
    ).rejects.toThrow();
    expect((await service.get('qamar'))?.version).toBe(current.version);
    expect((await service.get('qamar'))?.rules.minimumOrder).toBe(current.rules.minimumOrder);
  } finally {
    await admin.pool.query(`DROP TRIGGER ${name} ON settings_changes`);
    await admin.pool.query(`DROP FUNCTION ${name}()`);
  }
});
test('pricing holds configuration stable until its transaction completes', async () => {
  const current = await service.get('qamar');
  if (!current) throw new Error('Required test fixture is missing.');
  let release!: () => void, ready!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
  const reading = withTenant(app, 'qamar', async (tx) => {
    await loadPricingContext(tx, 'qamar', '2026-11-01');
    ready();
    await gate;
  });
  await locked;
  const saving = service.update('qamar', {
    version: current.version,
    approverId: 'u_aisha',
    reason: `${tag}-lock`,
    rules: { ...current.rules, minimumOrder: '234.56' },
  });
  try {
    expect(await Promise.race([saving.then(() => true), Bun.sleep(50).then(() => false)])).toBe(
      false,
    );
  } finally {
    release();
    await reading;
  }
  expect(await saving).toEqual({ ok: true, changed: true });
});
