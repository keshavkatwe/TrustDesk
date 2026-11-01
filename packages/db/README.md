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

## Drizzle Studio

From the repository root, start the database if needed, then run:

```sh
bun run db:up
bun run db:studio
```

Open the Studio URL printed in the terminal. The local Studio server binds to `127.0.0.1:4983`. The root command loads the root `.env` and forwards only `DATABASE_URL` and `STUDIO_TENANT_ID` to the task.

Studio uses the restricted application role and defaults to **Qamar**. All business tables force row-level security, so the connection sets `app.tenant_id` for every session. To inspect **Rimal**, stop Studio with Ctrl-C and restart it with:

```sh
STUDIO_TENANT_ID=rimal bun run db:studio
```

Only `qamar` and `rimal` are accepted. Existing database URL options are preserved. Studio keeps the application's permissions: published catalogue/routing/identity data and append-only audit records cannot be edited through this role. Use Settings for validated business-rule changes with named audit history. It does not disable tenant security, migrate or seed data. Empty workflow tables are expected until enquiries are submitted. `db:generate` still performs no database queries.

## Roles and tenant scope

`trustdesk_migrator` owns the tables and applies migrations/seeds. It is not a superuser and has no role-creation, database-creation or RLS-bypass privilege. `trustdesk_app` owns no tables and has no such privileges either. It can read all seventeen domain tables, insert/update approvers, lock/update conversations and drafts, insert conversations/messages/drafts/reviews/outbox/receipts/deliveries, update only message processing state, and insert/update AI attempts. It cannot update/delete review history, receipts, deliveries or outbox records; catalogues, routing configuration and business identity are read-only to it. It can update only the seven editable tenant-rule columns and insert settings audit records; settings history cannot be updated or deleted. Migration history is not granted to the application.

Every business-owned table enables and **forces** row-level security. Reads without tenant context return no rows, including for the owner. Write policies check the destination tenant as well as existing rows. `withTenant` opens a Drizzle transaction and calls parameterized `set_config('app.tenant_id', tenantId, true)`. The transaction, tenant context and queries stay on one pooled connection; context is cleared on commit or rollback.

```ts
import { createDatabase, withTenant } from '@trustdesk/db';

const database = createDatabase(applicationDatabaseUrl);
const rows = await withTenant(database, verifiedTenantId, (tx) =>
  tx.query.catalogueRows.findMany({
    where: (row, { eq }) => eq(row.tenantId, verifiedTenantId),
  }),
);
// On process shutdown:
await database.close();
```

Resolve `verifiedTenantId` from trusted identity/adapter data before this call; the helper does not authenticate a caller. Application filters remain explicit, with RLS as a second boundary. The local API supplies an explicit allowed-business list for workspace discovery. The local synthetic adapter resolves configured receiving channels within the operator scope; production adapter authentication remains planned. Do not use migration credentials in request handling or workers.

## Relational reads

`src/relations.ts` defines Drizzle 0.45.4 `relations()` for the domain tables. The client registers tables and relations together, enabling typed nested queries on both the database and a transaction:

```ts
const rows = await withTenant(database, verifiedTenantId, (tx) =>
  tx.query.conversations.findMany({
    where: (conversation, { eq }) => eq(conversation.tenantId, verifiedTenantId),
    with: {
      messages: {
        where: (message, { eq }) => eq(message.tenantId, verifiedTenantId),
        orderBy: (message, { asc }) => asc(message.sequence),
        with: { drafts: true },
      },
    },
  }),
);
```

Every composite link includes tenant ownership, and the two AI-run draft links have distinct relation names. Intake, drafting, review, dispatch, worker recovery, pricing and seed reads use `findMany/findFirst`. The inbox loads message/conversation, review/outbox/delivery and the latest/originating AI runs through relations, selecting only the AI metadata it needs. Workspace reads include approvers and receiving channels.

Use this style for application reads. Explicit SQL remains for row locks, mutations and three predicate subqueries that filter corrections, abandoned jobs and already-recorded deliveries in the database. Dispatch filters before its 25-item limit. Pricing reads tenant configuration and catalogue rows with top-level query calls, preserving bigint decoding rather than nesting source amounts inside JSON. Relations are application metadata: they require no migration and do not replace database foreign keys or tenant RLS.

## Schema and seeds

| Table | Identity and purpose |
| --- | --- |
| `tenants` | Tenant ID; currency, VAT, languages, service area, auto-send setting, discount threshold, minimum order, FAQ and structured commercial rules |
| `approvers` | Composite tenant + approver ID |
| `receiving_channels` | Unique channel + destination across businesses, with a tenant foreign key and lookup index |
| `catalogue_versions` | Composite tenant + source version, with provenance/hash |
| `catalogue_rows` | Composite tenant + version + original row ID; composite reference to its version |
| `conversations` | Composite tenant + ID; unique channel/customer; latest message sequence |
| `messages` | Composite tenant + ID; unique tenant/channel/provider message ID and conversation sequence |
| `drafts` | Composite tenant + ID; unique message/version; sample evidence, original reply and record revision |
| `reviews` | One terminal decision per draft; named approver snapshot, before/after wording, Unicode edit diff and reason |
| `outbox` | One pending intent per approved review; composite reference prevents intent for rejection/handoff |
| `event_receipts` | One row per accepted/duplicate/conflicting delivery; tenant/message reference, body hash and untrusted tenant claim |
| `deliveries` | One immutable simulated-send/cancellation result per outbox intent, with approved text and simulation ID |
| `settings_changes` | Tenant + change ID; named approver snapshot, reason, immutable before/after rules and save time |
| `ai_runs` | Tenant + run ID; one active run per message, source/result draft references, versions, response/usage, timing and categorized outcome |

Money uses PostgreSQL `bigint`, returned as JavaScript `bigint`; decimal source conversion never multiplies binary floating-point values. Serialize amounts deliberately at a future HTTP boundary rather than directly JSON-encoding `bigint`. Constraints reject negative prices, invalid rate combinations, duplicate identities and cross-tenant version references. Timestamps use `timestamptz`.

The original challenge files are in `seed/`. Seeding is atomic per business and repeatable. It inserts two businesses, four approvers, five channels, two catalogue versions and twenty source rows. It preserves existing records and requires a new catalogue version for changed source prices. The root seed command then runs the core inbox seed, which imports six sample drafts and original customer messages after checking the tenant destination mapping. It does not replay all events or call a model. Foundation seeding fills only a null commercial-rules field on existing tenants. Core seeding regenerates calculations/templates only for unreviewed samples, advancing their revision on change. Terminal decisions and historical evidence are preserved.

## Migrations and verification

After editing `src/schema.ts`, run `bun run db:generate`, inspect the generated SQL, then apply it with `bun run db:migrate`. Commit migration SQL and its Drizzle metadata together. Custom migrations `0001_tenant_security.sql` and `0003_inbox_permissions.sql` supply forced RLS and role grants that Drizzle's schema snapshot does not represent. New tables need the corresponding privilege/forced-RLS migration. Use reviewed migrations rather than `drizzle-kit push`.

Database-changing commands and tests are never cached by Turbo. `db:generate` is offline; other commands receive only the URLs they need. Database construction is explicit and connections are lazy, so API construction, OpenAPI export, builds and ordinary checks still work without Postgres.

`bun run check` includes the database's source-decimal unit tests and needs no server. `bun run db:test` separately migrates/seeds the test database and runs real integration tests. It requires distinct application/migration roles pointing to the same database whose name ends in `_test`. It never truncates or drops databases; foundation write probes are rolled back. Inbox tests commit isolated UUID fixtures to exercise persistence, then remove only their own records in dependency order. A narrowly targeted temporary trigger injects outbox failure in the test database and is removed in `finally`. Tests cover restricted roles, forced/default-deny RLS, omitted/wrong filters, cross-tenant writes, transaction rollback, pooled connection reuse, concurrent contexts, source integrity, repeatable migrations/seeds, source-destination uniqueness and price/reference constraints.

Core inbox tests additionally cover two independent application pools racing to decide, stale record revisions, newer messages/draft versions, required reasons, persisted Unicode edits, outbox uniqueness/approval-only constraints, cross-business references and atomic rollback when outbox insertion fails.

Review locks the conversation before the draft, rechecks the latest message/draft and record revision, then saves the terminal status, immutable review/edit and pending outbox intent in one transaction. Future ingestion and draft creation must take the same conversation lock before advancing sequences or versions. The simulator takes the same conversation lock, rechecks staleness/pricing and inserts exactly one delivery/cancellation result; a pending intent is never a delivery claim.

Intake reserves a sequence with `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` on the existing business/channel/customer key. The upsert holds the conversation write lock through commit, before any draft update. `latest_sequence` is the authoritative counter: new conversations start at 1; subsequent messages increment it atomically. Imports must maintain the same invariant. Failed intake rolls the increment back with its message/job. Earlier pending drafts are updated together rather than selected and updated one at a time. The shared draft loader reads the message/latest version together; pricing reads its business configuration directly from the locked top-level row, preserving bigint decoding. No schema or permission change is needed.

Pricing/policy evidence is stored in each draft’s existing JSONB evidence, with the structured sample request, engine/catalogue versions and a fingerprint of source configuration. Approval rechecks that fingerprint and policy before committing. Settings can update the explicitly granted rule columns. The service locks the tenant row exclusively, verifies the current configuration fingerprint and local approver, then commits the rule update and before/after audit together. Pricing reads take a shared tenant-row lock through approval, dispatch or draft completion, so a settings save cannot interleave with those calculations. Rule changes require regenerating pending drafts. Catalogue prices, identity and routing remain read-only.

AI drafting uses the application role. A short conversation-locked transaction claims a run; inference runs with no database transaction held. Completion rechecks the source message/draft and configuration before atomically inserting the new version, superseding the old pending draft and saving the attempt outcome. Migration `0005_harsh_randall.sql` also forces RLS on AI runs and grants runtime draft insertion. AI attempts have no runtime delete permission; catalogue data, routing, identity and review history remain read-only. Failed provider calls may have unknown cost; a crash before recording usage requires later reconciliation.

Migration `0006_calm_ozymandias.sql` adds receipt/delivery tables with forced RLS and append-only runtime grants, message processing state, and runtime intake insertion. Queue setup is pinned to pg-boss 12.38.0 (schema 46) in its own `pgboss` schema and runs after domain migrations. Runtime gets schema usage/table DML, with migration and runtime URLs kept separate. Queue jobs contain identifiers only; business payloads remain in domain tables. PostgreSQL/pg-boss queue and receipt insertion share one Drizzle transaction. Worker recovery never treats missing usage as zero or automatically repeats an expired paid attempt.

Migration `0007_optimal_monster_badoon.sql` adds forced-RLS `settings_changes` with tenant-inclusive approver references, a tenant/time index and append-only runtime grants. Runtime tenant UPDATE grants cover only VAT, discount threshold, minimum order, service areas, FAQ, auto-send and commercial rules. Money is converted from decimal strings with bigint; no schema reset or reseed is needed for this migration.


Migrations `0008_classy_blink.sql` and `0009_funny_morg.sql` add immutable evaluation runs, human labels and trust history with forced RLS, tenant-inclusive references and SELECT/INSERT-only runtime grants. Outbox intent now has exactly one authorization source: a named approval, or an automatic FAQ draft plus a named promotion event. The latter is created only by the code eligibility gate and rechecked under the trust lock before simulated dispatch. Review/delivery history is preserved; no data reset is needed. Evaluation evidence seeding imports genuine saved reports/labels without calling a model. Runtime cannot rewrite or delete this evidence.
