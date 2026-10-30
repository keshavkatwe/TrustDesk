import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createDatabase, withTenant } from '../src/client.ts';
import { databaseUrl } from '../src/config.ts';
import { migrateDatabase } from '../src/migrate.ts';
import {
  approvers,
  catalogueRows,
  catalogueVersions,
  receivingChannels,
  tenants,
} from '../src/schema.ts';
import { loadSeed, seedDatabase } from '../src/seed.ts';
import { scaledInteger } from '../src/seed-model.ts';

const appUrl = databaseUrl('DATABASE_TEST_URL');
const adminUrl = databaseUrl('DATABASE_TEST_ADMIN_URL');
const appTarget = new URL(appUrl);
const adminTarget = new URL(adminUrl);
if (
  !appTarget.pathname.endsWith('_test') ||
  appTarget.host !== adminTarget.host ||
  appTarget.pathname !== adminTarget.pathname ||
  appTarget.username === adminTarget.username
)
  throw new Error(
    'Database tests require matching *_test databases and separate app/migration roles.',
  );

const app = createDatabase(appUrl, { max: 1 });
const admin = createDatabase(adminUrl, { max: 1 });

async function expectPgCode(operation: () => Promise<unknown>, code: string) {
  let failure: unknown;
  try {
    await operation();
  } catch (error) {
    failure = error;
  }
  while (failure instanceof Error && 'cause' in failure && failure.cause) failure = failure.cause;
  expect(
    failure && typeof failure === 'object' && 'code' in failure ? failure.code : undefined,
  ).toBe(code);
}

beforeAll(async () => {
  await migrateDatabase(adminUrl);
  await migrateDatabase(adminUrl);
  await seedDatabase(admin);
}, 30000);

afterAll(async () => {
  await Promise.all([app.close(), admin.close()]);
});

describe('real Postgres foundation', () => {
  test('application role is restricted and all ten tables force RLS', async () => {
    const role = await app.pool.query(
      'select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb from pg_roles where rolname = current_user',
    );
    expect(role.rows).toEqual([
      { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false },
    ]);
    const tables = await app.pool.query(
      "select relname, relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) as owner from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'",
    );
    expect(tables.rows).toHaveLength(10);
    expect(
      tables.rows.every(
        (table) =>
          table.relrowsecurity && table.relforcerowsecurity && table.owner !== appTarget.username,
      ),
    ).toBe(true);
  });

  test('no tenant context means no business data, including for the table owner', async () => {
    for (const database of [app, admin]) {
      expect(await database.db.select().from(tenants)).toEqual([]);
      expect(await database.db.select().from(approvers)).toEqual([]);
      expect(await database.db.select().from(receivingChannels)).toEqual([]);
      expect(await database.db.select().from(catalogueVersions)).toEqual([]);
      expect(await database.db.select().from(catalogueRows)).toEqual([]);
    }
  });

  test('omitting the application tenant filter still exposes only the transaction tenant', async () => {
    for (const id of ['qamar', 'rimal']) {
      await withTenant(app, id, async (tx) => {
        expect((await tx.select().from(tenants)).map((row) => row.id)).toEqual([id]);
        const rows = await tx.select().from(catalogueRows);
        expect(rows).toHaveLength(10);
        expect(rows.every((row) => row.tenantId === id)).toBe(true);
        expect(
          await tx
            .select()
            .from(catalogueRows)
            .where(eq(catalogueRows.tenantId, id === 'qamar' ? 'rimal' : 'qamar')),
        ).toEqual([]);
      });
    }
  });

  test('seed preserves source identities, language, policies and exact catalogue rates; repeating it is safe', async () => {
    await seedDatabase(admin);
    const source = await loadSeed();
    for (const business of source.businesses) {
      await withTenant(app, business.id, async (tx) => {
        const [stored] = await tx.select().from(tenants);
        expect(stored?.currency).toBe(business.currency);
        expect(stored?.languages).toEqual(business.languages);
        expect(stored?.faq).toEqual(business.faq);
        expect(stored?.serviceAreas).toEqual(business.policy.service_area);
        expect(stored?.vatBasisPoints).toBe(business.id === 'qamar' ? 500 : 1500);
        expect(stored?.discountThresholdBasisPoints).toBe(business.id === 'qamar' ? 1000 : 500);
        expect(stored?.minimumOrderMinor).toBe(business.id === 'qamar' ? 0n : 200000n);
        expect((await tx.select().from(approvers)).map((row) => row.id).sort()).toEqual(
          business.approvers.map((row) => row.id).sort(),
        );
        expect(
          (await tx.select().from(receivingChannels))
            .map((row) => `${row.channel}:${row.address}`)
            .sort(),
        ).toEqual(business.channels.map((row) => `${row.channel}:${row.address}`).sort());
        const catalogue = source.catalogues.find((entry) => entry.tenant === business.id);
        if (!catalogue) throw new Error('Catalogue source missing.');
        expect(await tx.select().from(catalogueVersions)).toHaveLength(1);
        const rows = await tx.select().from(catalogueRows);
        expect(rows).toHaveLength(catalogue.rows.length);
        for (const original of catalogue.rows) {
          const row = rows.find((entry) => entry.id === original.id);
          expect(row).toMatchObject({
            item: original.item,
            itemArabic: original.item_ar ?? null,
            version: catalogue.version,
            rentPerMonthMinor:
              original.rent_per_month === undefined
                ? null
                : scaledInteger(original.rent_per_month, 2),
            buyMinor: original.buy === undefined ? null : scaledInteger(original.buy, 2),
            perDayMinor: original.per_day === undefined ? null : scaledInteger(original.per_day, 2),
            perShiftMinor:
              original.per_shift === undefined ? null : scaledInteger(original.per_shift, 2),
            flatMinor: original.flat === undefined ? null : scaledInteger(original.flat, 2),
          });
        }
        if (business.id === 'qamar')
          expect(rows.find((row) => row.id === 'Q-PHN-001')?.buyMinor).toBe(339900n);
        else expect(rows.find((row) => row.id === 'R-CRW-001')?.perShiftMinor).toBe(220000n);
      });
    }
  });

  test('same pooled connection loses tenant context after both commit and rollback', async () => {
    const first = await withTenant(
      app,
      'qamar',
      async (tx) =>
        (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0]?.pid,
    );
    const second = await withTenant(app, 'rimal', async (tx) => {
      expect((await tx.select().from(tenants)).map((row) => row.id)).toEqual(['rimal']);
      return (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0]?.pid;
    });
    expect(first).toBe(second);
    expect(await app.db.select().from(tenants)).toEqual([]);
    const rollback = new Error('Intentional test rollback');
    await expect(
      withTenant(app, 'qamar', async () => {
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(await app.db.select().from(tenants)).toEqual([]);
  });

  test('concurrent tenant transactions on separate pooled connections stay isolated', async () => {
    const concurrent = createDatabase(appUrl, { max: 2 });
    try {
      const results = await Promise.all(
        ['qamar', 'rimal'].map((id) =>
          withTenant(concurrent, id, async (tx) => {
            const result = await tx.execute<{ pid: number }>(
              sql`select pg_backend_pid() as pid, pg_sleep(0.03)`,
            );
            return {
              id,
              pid: result.rows[0]?.pid,
              tenants: (await tx.select().from(tenants)).map((row) => row.id),
            };
          }),
        ),
      );
      for (const result of results) expect(result.tenants).toEqual([result.id]);
      expect(results[0]?.pid).not.toBe(results[1]?.pid);
    } finally {
      await concurrent.close();
    }
  });

  test('own-tenant writes succeed and a deliberate rollback leaves no fixture changes', async () => {
    const id = `probe-${randomUUID()}`;
    const rollback = new Error('Discard test approver');
    await expect(
      withTenant(app, 'qamar', async (tx) => {
        const inserted = await tx
          .insert(approvers)
          .values({ tenantId: 'qamar', id, name: 'Test approver', role: 'Test' })
          .returning();
        expect(inserted).toHaveLength(1);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(
      await withTenant(app, 'qamar', (tx) =>
        tx.select().from(approvers).where(eq(approvers.id, id)),
      ),
    ).toEqual([]);
  });

  test('cross-tenant inserts and moving a record to another tenant are blocked', async () => {
    await expectPgCode(
      () =>
        withTenant(app, 'qamar', (tx) =>
          tx
            .insert(approvers)
            .values({ tenantId: 'rimal', id: 'probe', name: 'Test', role: 'Test' }),
        ),
      '42501',
    );
    await expectPgCode(
      () =>
        withTenant(app, 'qamar', (tx) =>
          tx.update(approvers).set({ tenantId: 'rimal' }).where(eq(approvers.id, 'u_aisha')),
        ),
      '42501',
    );
    expect(
      await withTenant(app, 'qamar', (tx) =>
        tx
          .update(approvers)
          .set({ name: 'Wrong tenant' })
          .where(eq(approvers.id, 'u_faisal'))
          .returning(),
      ),
    ).toEqual([]);
  });

  test('application role cannot change published prices or disable RLS', async () => {
    await expectPgCode(
      () => withTenant(app, 'qamar', (tx) => tx.update(catalogueRows).set({ buyMinor: 1n })),
      '42501',
    );
    await expectPgCode(
      () => app.db.execute(sql`alter table catalogue_rows disable row level security`),
      '42501',
    );
  });

  test('composite catalogue references reject a version belonging only to another business', async () => {
    const version = `probe-${randomUUID()}`;
    await expectPgCode(
      () =>
        withTenant(admin, 'rimal', async (tx) => {
          await tx
            .insert(catalogueVersions)
            .values({ tenantId: 'rimal', version, source: 'test', sourceHash: 'a'.repeat(64) });
          await tx.execute(sql`select set_config('app.tenant_id', 'qamar', true)`);
          await tx
            .insert(catalogueRows)
            .values({ tenantId: 'qamar', version, id: 'probe', item: 'Test', flatMinor: 1n });
        }),
      '23503',
    );
  });

  test('database rejects duplicate source rows, negative prices and rows with no price', async () => {
    const row = {
      tenantId: 'qamar',
      version: '2026-11-01',
      id: 'Q-LAP-001',
      item: 'Duplicate',
      flatMinor: 1n,
    };
    await expectPgCode(
      () => withTenant(admin, 'qamar', (tx) => tx.insert(catalogueRows).values(row)),
      '23505',
    );
    await expectPgCode(
      () =>
        withTenant(admin, 'qamar', (tx) =>
          tx.insert(catalogueRows).values({ ...row, id: 'probe', flatMinor: -1n }),
        ),
      '23514',
    );
    await expectPgCode(
      () =>
        withTenant(admin, 'qamar', (tx) =>
          tx.insert(catalogueRows).values({ ...row, id: 'probe', flatMinor: null }),
        ),
      '23514',
    );
  });

  test('one receiving destination cannot belong to two businesses', async () => {
    await expectPgCode(
      () =>
        withTenant(admin, 'rimal', (tx) =>
          tx.insert(receivingChannels).values({
            tenantId: 'rimal',
            channel: 'whatsapp',
            address: '+971 4 000 0101',
          }),
        ),
      '23505',
    );
  });
});
