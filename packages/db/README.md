# Database foundation

PostgreSQL 18.6, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11 and node-postgres 8.23.1. Schema, connection pooling, migrations and tenant-scoped access live in this package. Business services belong in `packages/core`.

From the repository root, with Docker running:

```sh
bun run db:up
bun run db:migrate
bun run db:seed
bun run db:test
```

The local container binds only to `127.0.0.1:5433`. Compose creates a persistent named volume, a development database (`trustdesk`) and an integration-test database (`trustdesk_test`). `bun run db:down` stops/removes the container and preserves its volume. Bootstrap SQL runs only for a fresh volume; changing it does not rewrite existing roles or databases.

Defaults work without an `.env`. Override connection URLs using the root `.env.example`. If you change `POSTGRES_PORT`, update the URLs too. The checked-in passwords are local development credentials. Separate environment variables select the application, migration, test application and test migration connections. Neither database credentials nor queries are sent to the web client.

## Roles and tenant scope

`trustdesk_migrator` owns the tables and applies migrations/seeds. It is not a superuser and has no role-creation, database-creation or RLS-bypass privilege. `trustdesk_app` owns no tables and has no such privileges either. It can read the foundation tables and insert/update approvers; catalogues, routing configuration and tenant configuration are read-only to it. Migration history is not granted to the application.

Every business-owned table enables and **forces** row-level security. Reads without tenant context return no rows, including for the owner. Write policies check the destination tenant as well as existing rows. `withTenant` opens a Drizzle transaction and calls parameterized `set_config('app.tenant_id', tenantId, true)`. The transaction, tenant context and queries stay on one pooled connection; context is cleared on commit or rollback.

```ts
import { eq } from 'drizzle-orm';
import { catalogueRows, createDatabase, withTenant } from '@trustdesk/db';

const database = createDatabase(applicationDatabaseUrl);
const rows = await withTenant(database, verifiedTenantId, (tx) =>
  tx.select().from(catalogueRows)
    .where(eq(catalogueRows.tenantId, verifiedTenantId)),
);
// On process shutdown:
await database.close();
```

Resolve `verifiedTenantId` from trusted identity/adapter data before this call; the helper does not authenticate a caller. Application filters remain explicit, with RLS as a second boundary. Unscoped workspace discovery and authenticated receiving-channel resolution will be added when the API is connected. Do not use migration credentials in request handling or workers.

## Schema and seeds

| Table | Identity and purpose |
| --- | --- |
| `tenants` | Tenant ID; currency, VAT, languages, service area, auto-send setting, discount threshold, minimum order and FAQ |
| `approvers` | Composite tenant + approver ID |
| `receiving_channels` | Unique channel + destination across businesses, with a tenant foreign key and lookup index |
| `catalogue_versions` | Composite tenant + source version, with provenance/hash |
| `catalogue_rows` | Composite tenant + version + original row ID; composite reference to its version |

Money uses PostgreSQL `bigint`, returned as JavaScript `bigint`; decimal source conversion never multiplies binary floating-point values. Serialize amounts deliberately at a future HTTP boundary rather than directly JSON-encoding `bigint`. Constraints reject negative prices, invalid rate combinations, duplicate identities and cross-tenant version references. Timestamps use `timestamptz`.

The original challenge files are in `seed/`. Seeding is atomic per business and repeatable. It inserts two businesses, four approvers, five channels, two catalogue versions and twenty source rows. It preserves existing records and requires a new catalogue version for changed source prices. It does not replay events, create messages, call a model or record approvals.

## Migrations and verification

After editing `src/schema.ts`, run `bun run db:generate`, inspect the generated SQL, then apply it with `bun run db:migrate`. Commit migration SQL and its Drizzle metadata together. Custom migration `0001_tenant_security.sql` supplies forced RLS and role grants that Drizzle's schema snapshot does not represent. New tables need the corresponding privilege/forced-RLS migration. Use reviewed migrations rather than `drizzle-kit push`.

Database-changing commands and tests are never cached by Turbo. `db:generate` is offline; other commands receive only the URLs they need. Database construction is explicit and connections are lazy, so API construction, OpenAPI export, builds and ordinary checks still work without Postgres.

`bun run check` includes the database's source-decimal unit tests and needs no server. `bun run db:test` separately migrates/seeds the test database and runs real integration tests. It requires distinct application/migration roles pointing to the same database whose name ends in `_test`. It never truncates or drops databases; successful write probes are rolled back. Tests cover restricted roles, forced/default-deny RLS, omitted/wrong filters, cross-tenant writes, transaction rollback, pooled connection reuse, concurrent contexts, source integrity, repeatable migrations/seeds, source-destination uniqueness and price/reference constraints.

The inbox still uses the disposable `/demo` adapter. Durable inbox/review services, queue processing and runtime tenant discovery are the next integration steps.
