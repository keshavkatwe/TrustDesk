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

`trustdesk_migrator` owns the tables and applies migrations/seeds. It is not a superuser and has no role-creation, database-creation or RLS-bypass privilege. `trustdesk_app` owns no tables and has no such privileges either. It can read all ten tables, insert/update approvers, lock/update conversations and drafts, and insert reviews/outbox intent. It cannot update/delete review history or outbox records; catalogues, routing configuration and tenant configuration are read-only to it. Migration history is not granted to the application.

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

Resolve `verifiedTenantId` from trusted identity/adapter data before this call; the helper does not authenticate a caller. Application filters remain explicit, with RLS as a second boundary. The local API supplies an explicit allowed-business list for workspace discovery. Authenticated receiving-channel resolution remains planned. Do not use migration credentials in request handling or workers.

## Schema and seeds

| Table | Identity and purpose |
| --- | --- |
| `tenants` | Tenant ID; currency, VAT, languages, service area, auto-send setting, discount threshold, minimum order and FAQ |
| `approvers` | Composite tenant + approver ID |
| `receiving_channels` | Unique channel + destination across businesses, with a tenant foreign key and lookup index |
| `catalogue_versions` | Composite tenant + source version, with provenance/hash |
| `catalogue_rows` | Composite tenant + version + original row ID; composite reference to its version |
| `conversations` | Composite tenant + ID; unique channel/customer; latest message sequence |
| `messages` | Composite tenant + ID; unique tenant/channel/provider message ID and conversation sequence |
| `drafts` | Composite tenant + ID; unique message/version; sample evidence, original reply and record revision |
| `reviews` | One terminal decision per draft; named approver snapshot, before/after wording, Unicode edit diff and reason |
| `outbox` | One pending intent per approved review; composite reference prevents intent for rejection/handoff |

Money uses PostgreSQL `bigint`, returned as JavaScript `bigint`; decimal source conversion never multiplies binary floating-point values. Serialize amounts deliberately at a future HTTP boundary rather than directly JSON-encoding `bigint`. Constraints reject negative prices, invalid rate combinations, duplicate identities and cross-tenant version references. Timestamps use `timestamptz`.

The original challenge files are in `seed/`. Seeding is atomic per business and repeatable. It inserts two businesses, four approvers, five channels, two catalogue versions and twenty source rows. It preserves existing records and requires a new catalogue version for changed source prices. The root seed command then runs the core inbox seed, which imports six sample drafts and original customer messages after checking the tenant destination mapping. It does not replay all events or call a model. Both seeds insert only missing rows and preserve decisions.

## Migrations and verification

After editing `src/schema.ts`, run `bun run db:generate`, inspect the generated SQL, then apply it with `bun run db:migrate`. Commit migration SQL and its Drizzle metadata together. Custom migrations `0001_tenant_security.sql` and `0003_inbox_permissions.sql` supply forced RLS and role grants that Drizzle's schema snapshot does not represent. New tables need the corresponding privilege/forced-RLS migration. Use reviewed migrations rather than `drizzle-kit push`.

Database-changing commands and tests are never cached by Turbo. `db:generate` is offline; other commands receive only the URLs they need. Database construction is explicit and connections are lazy, so API construction, OpenAPI export, builds and ordinary checks still work without Postgres.

`bun run check` includes the database's source-decimal unit tests and needs no server. `bun run db:test` separately migrates/seeds the test database and runs real integration tests. It requires distinct application/migration roles pointing to the same database whose name ends in `_test`. It never truncates or drops databases; foundation write probes are rolled back. Inbox tests commit isolated UUID fixtures to exercise persistence, then remove only their own records in dependency order. A narrowly targeted temporary trigger injects outbox failure in the test database and is removed in `finally`. Tests cover restricted roles, forced/default-deny RLS, omitted/wrong filters, cross-tenant writes, transaction rollback, pooled connection reuse, concurrent contexts, source integrity, repeatable migrations/seeds, source-destination uniqueness and price/reference constraints.

Core inbox tests additionally cover two independent application pools racing to decide, stale record revisions, newer messages/draft versions, required reasons, persisted Unicode edits, outbox uniqueness/approval-only constraints, cross-business references and atomic rollback when outbox insertion fails.

Review locks the conversation before the draft, rechecks the latest message/draft and record revision, then saves the terminal status, immutable review/edit and pending outbox intent in one transaction. Future ingestion and draft creation must take the same conversation lock before advancing sequences or versions. Dispatch is not implemented and must recheck staleness when added; a pending intent is never a delivery claim.
