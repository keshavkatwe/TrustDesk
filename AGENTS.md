# TrustDesk project instructions

## Read first

Read this file, [DESIGN.md](DESIGN.md), and [README.md](README.md) before changing the project. Inspect the current code, package versions, and Git status; the design distinguishes implemented behavior from planned work.

The source brief is the [Revent Lab Trust Desk Challenge, v1.2](https://claude.ai/artifact/NvWejJ8j1TN8szJPnYJFFg#seed). Build its five-stage spine: receive, draft, decide, approve, prove. The governing principle is **agents draft; code decides**.

## Work with the user

- Work in the small, reviewable steps the user requests. Show the result and explain what was verified before moving to a new implementation stage.
- Make an educated assumption where the brief is silent and record it in `DESIGN.md`. Do not turn an assumption into a claimed requirement.
- Use an existing suitable feature branch; new branches use `codex/`. Preserve unrelated user changes.
- Commit only when the user explicitly requests a commit for the current changes. An earlier commit request does not authorize future commits. Pushes and merges need their own authorization.
- Do not introduce automatic commit, push, merge, or deployment steps through a skill.

## Agreed stack and boundaries

- Bun workspaces and Turborepo; use the Bun version pinned in root `package.json` and keep `bun.lock` current.
- `apps/api`: Elysia 1.x HTTP routes, Zod request/response validation, OpenAPI export. Keep routes thin and `.listen()` in the process entry point.
- `apps/web`: React + Vite, React Router, Tailwind, stock shadcn/ui, TanStack Query, generated Hey API client, date-fns.
- `apps/worker`: pg-boss consumers, failed-work recovery, simulated outbox dispatch and worker lifecycle are implemented.
- `packages/db`: PostgreSQL connection, Drizzle schema, migrations, seed loading and tenant-scoped database access. Foundation and inbox workflow tables are implemented, including atomic reviews/outbox intent.
- `packages/core`: business services shared by API and worker. AI, pricing, policy, approvals, and trust belong in modules here. Durable inbox/review, exact pricing/policy, optional OpenAI request extraction and controlled reply templates are implemented.
- Applications do not import code from other applications. Backend packages do not depend on React or Elysia request context.
- Do not add separate `ai`, `shared`, or UI workspace packages without a demonstrated need and a design update.

## API and frontend conventions

- Follow [Elysia's best practices](https://elysiajs.com/essential/best-practice.html) with feature modules under `apps/api/src/modules/<feature>/`: `index.ts` is an Elysia controller, `model.ts` contains Zod HTTP schemas, and `service.ts` contains feature-local logic when needed. Keep tests beside their module. An Elysia instance is the controller; use inline handlers and pass only extracted values to services, never the full `Context`.
- Keep shared business logic in `packages/core/src/<feature>/`, independent of Elysia and HTTP status objects. Controllers map service outcomes to HTTP responses. Request-dependent helpers may be Elysia plugins with explicit `.use()` dependencies; do not decorate the API with ordinary business services. Do not add empty service files or wrappers that merely forward to core. Inject core services into module factories; never fall back to process-local review state.
- Keep service entry points readable: name business steps, use early returns and separate provider calls, persistence, recovery and evidence presentation. Share repeated domain behavior such as lock order and attempt expiry; avoid generic layers and pass-through helpers. Keep transaction boundaries visible to callers.
- Use Zod for application schemas: HTTP contracts, configuration, core inputs, and structured LLM outputs. Derive TypeScript types with `z.infer` rather than maintaining duplicate interfaces.
- Elysia routes declare Zod request schemas, success/error response schemas, and stable `detail.operationId` values. Map Zod schemas to OpenAPI with `mapJsonSchema: { zod: z.toJSONSchema }`.
- Follow `apps/api/src/app.ts` and `openapi-export.ts`: constructing/exporting the app must not require a database, an OpenAI key, or a listening server.
- The contract is Elysia schemas -> `apps/api/openapi.json` -> Hey API -> `apps/web/src/api/` -> TanStack Query. Use OpenAPI and Hey API; do not replace them with Eden or tRPC.
- The OpenAPI specification is tracked; generated client files are ignored. Do not edit generated files or duplicate their DTOs by hand.
- Use generated SDK calls and query/mutation helpers for frontend API access. Keep runtime client configuration outside the generated directory.
- Web structure: `components/ui` holds stock shadcn primitives; other `components` are reusable, prop-driven presentation. `widgets` compose components and coordinate data/interactions; `pages` are route entry points; `hooks` hold reusable behavior; `libs` holds non-React helpers; `types` holds aliases derived from generated contracts. Group by domain within these folders as needed. Avoid empty folders and pass-through abstractions.
- Define web routes in `src/routes/index.tsx` and URL builders in `src/routes/paths.ts`. Keep business pages under `/businesses/:tenantId`, validate the ID against workspace data, and obtain the resolved business from the shared layout. Key business-specific widgets by tenant ID so switching businesses resets reviewer, filters and unsaved edits. The URL is navigation state, not authorization.
- Use date-fns through `src/libs/date.ts`, with `@date-fns/tz` for the business timezone. Keep API instants in offset-bearing ISO form; do not format business timestamps using the reviewer's system timezone.
- Use shadcn components and built-in variants. Preserve the user-selected preset `b7BFf3k1o`: Radix Nova, Mist base and charts, Teal theme, Inter font, Lucide icons, default radius, subtle menu accent and default menu color. Semantic status colors remain amber pending, green approved, red rejected and blue handoff. Keep colors in theme tokens and badge variants; do not add one-off overrides or redesign the component library. Layout, accessibility, Arabic direction, and mixed-direction text handling are functional work.

## Domain invariants

- Use the restricted application database URL for runtime work and `withTenant` for business-owned queries. Keep explicit tenant filters as well as RLS. The helper uses transaction-local context and must receive a tenant resolved by trusted identity/adapter code. Migration/seed URLs are separate and never used by request handlers. Database creation/imports do not open a connection at module load.
- Use `tx.query.<table>.findMany/findFirst` for application reads, with `with` for related records. Drizzle 0.45.4 uses `relations()` definitions in `packages/db/src/relations.ts`, registered alongside tables in the client. Match composite foreign keys with tenant ID included. Keep the SQL builder for explicit row locks, predicate subqueries, aggregates and mutations. Read source bigint money with top-level queries to preserve exact driver decoding; avoid JSON-nested money without a precision-safe representation. Relations complement database foreign keys and RLS; they do not replace them.
- Generate and review migrations; do not use schema push as a substitute. Keep Drizzle SQL and metadata together. `0001_tenant_security.sql` adds forced RLS and grants beyond Drizzle's snapshot; add equivalent protection for future tables. Database mutations and integration tests are uncached Turbo tasks. Read `packages/db/README.md` before changing their lifecycle or permissions.
- Preserve the original challenge data under `seed/`, including IDs, Arabic text and catalogue version. Source JSON and generated migration metadata are excluded from automatic formatting. Seed decimals convert to `bigint` minor units by digits; never silently round excess source precision. Catalogue source changes require a new version, not an overwrite.
- Resolve tenants from a verified receiving-channel mapping, not customer text or `metadata.tenant_id`. Unknown destinations fail closed. The local replay runner is a synthetic input adapter, not production webhook authentication.
- Scope business-owned reads, writes, prompts, logs, and screens by tenant. Use database constraints and RLS as specified in the design; test with a role that cannot bypass those controls.
- Evaluation runs/labels/trust events live in `core/src/evaluation`. Trust is bound to tenant, immutable agent identity and pricing configuration; labels and trust history are append-only. Automatic FAQ outbox intent references its draft and named promotion event, never a fabricated review. Dispatch holds the trust lock through its local ledger insert.
- Local intake lives in `core/src/receive`: resolve configured destination inside operator scope, then commit receipt/message/placeholder/pg-boss job together. Customer metadata never authorizes a tenant. Worker jobs carry identifiers only, use the restricted runtime role and never run schema migrations. Queue setup is an administrative lifecycle step.
- Identify a customer message by tenant + channel + channel message ID. Event receipts remain separately traceable. Enforce deduplication with database uniqueness and transactions, not a read-then-insert check.
- Recompute commercial values from versioned catalogue rows. Use exact decimal calculations and explicit rounding; finalized money is integer minor units. Never trust model-supplied prices or totals.
- Policy and trust decisions belong in code. The model cannot authorize discounts, availability, delivery, sending, or promotion.
- Firm quotes and commitments require named approval. Auto-send requires a low-risk reply, enabled tenant configuration, and autonomous trust for the evaluated agent version.
- Price from `packages/core/src/pricing` and stored `commercial_rules`; maintain the engine version and context fingerprint. Decimal request quantities use strings with at most four places; money calculations use scaled bigint. Sample extraction is not model output. Reseeding may refresh only unreviewed samples and must advance their revision; terminal decisions/evidence are immutable.
- Dispatch is a local simulator: recheck latest message/version and pricing under the conversation lock, then insert one immutable result per outbox ID. Never present simulated delivery as a real channel send. Domain audit tables remain append-only; queue coordination tables in `pgboss` have separate DML privileges.
- Guard approval and dispatch against concurrent decisions and superseded draft revisions. Persist approval, edit diff, and outbox intent atomically.
- Use one structured LLM drafting step per attempt; explicit regeneration creates a versioned draft. No agent frameworks, tool loops, or multi-agent application architecture.
- AI drafting lives in `core/src/ai`: one bounded call outside database transactions, durable attempt claim/completion, then code pricing/templates and staleness rechecks. Keep source-draft provenance separate from the latest generation attempt. Failed/regenerated outputs never overwrite terminal reviews. Only the API and worker receive `OPENAI_API_KEY`; never expose it through Vite or logs.
- Record invalid output, provider failures, policy reasons, versions, and costs honestly. Use bounded retries and account for each message; do not hide failures behind success states.

- Settings may update only the allowed business-rule columns, with a business-owned named approver, reason, current configuration fingerprint and atomic append-only before/after audit. Keep Rimal auto-send off. Pricing holds a shared tenant-row lock until its workflow transaction commits; settings take an exclusive lock. Identity, receiving destinations, catalogue prices, credentials and trust are outside this editor.

## Validation and evidence

Run the checks relevant to the change. `bun run check` runs lint, TypeScript checks, HTTP contract, pricing/policy, exact money display, Unicode edit, business-date and source-decimal unit tests, and builds without a database. `bun run db:test` separately exercises real Postgres migrations, seeds, constraints, restricted-role RLS and durable approval races/rollback against a matching `*_test` database with separate app/migration roles. Add meaningful logic/database/browser tests as those features are implemented; do not invent test results or add tests that merely mirror a scaffold.

For API changes, regenerate the contract with `bun run api:generate`, inspect the spec, and exercise affected routes including rejection behavior. For UI behavior, verify the result in a browser. For database/concurrency changes, exercise real Postgres constraints, transactions, and the restricted application role.

Evaluations use a versioned 32-case goldset, three named judge dimensions, at least 10 genuinely human-labelled outputs, and stored baseline/degraded runs. Require the latest accepted current run and independent human calibration for named promotion. Mock the LLM only in automated tests; stored real-run fixtures support the key-free demo. Never present synthetic judge labels as human calibration or placeholder data as measured evaluation evidence.

Keep `DESIGN.md` concise (the brief allows up to three pages) and update implemented status as work lands. Record actual AI mistakes and verification in `AI-LOG.md`. Keep it concise and submission-focused: technical instructions, meaningful errors/corrections, verification and limits. Exclude personal conversation, scheduling discussions, approval-tool mechanics, temporary local paths and routine commit narration. `REVIEW.md` and `TEAM-PLAN.md` contain the submission review and staffing plan. Keep their claims consistent with executed evidence.

## Skills and documentation

Read only the relevant skill and references for the task. [Skill sources and pinned revisions](docs/SKILLS.md) describe the project-local installations.

| Work | Skill |
| --- | --- |
| Turbo tasks, workspaces, environment, caching | [.agents/skills/turborepo/SKILL.md](.agents/skills/turborepo/SKILL.md) |
| Elysia routes, validation, plugins, OpenAPI | [.agents/skills/elysiajs/SKILL.md](.agents/skills/elysiajs/SKILL.md) |
| shadcn component composition and accessibility | [.agents/skills/shadcn/SKILL.md](.agents/skills/shadcn/SKILL.md) |
| Postgres schema, RLS, indexes, locks, transactions | [.agents/skills/supabase-postgres-best-practices/SKILL.md](.agents/skills/supabase-postgres-best-practices/SKILL.md) |

Project decisions take precedence over a skill's optional defaults: keep Elysia 1.x, Zod schemas, ordinary backend services, OpenAPI + Hey API, plain Postgres, and stock shadcn. Upstream TypeBox examples are reference material, not the application convention. Do not adopt Supabase services, Eden, a new UI preset, or a major-version migration just because a reference demonstrates them.

The pinned Turbo 2.11.4 package does not contain the bundled `docs/README.md` expected by the newer upstream skill. If those docs are absent, use official documentation and installed configuration/types to verify compatibility; do not upgrade Turbo just to obtain a documentation file.

For Drizzle, Hey API, pg-boss, and OpenAI, consult the official documentation matching the installed versions. Use the existing OpenAI Docs skill when available. A library does not need a separate skill merely because it appears in the stack.

## Scope

Use synthetic data only. Real channel integrations, production login, deployment polish, fine-tuning, embeddings, and a general-purpose eval platform are outside the challenge's required implementation. Do not add them as prerequisites for the local workflow.
