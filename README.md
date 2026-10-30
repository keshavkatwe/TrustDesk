# TrustDesk

Turborepo workspace for the Trust Desk engineering challenge, with a Postgres-backed shadcn inbox, named reviews, saved edit history and atomic outbox intent. Pricing/policy use source data and exact arithmetic. A local incoming adapter and pg-boss worker now connect message receipt, AI drafting, review and simulated delivery.

## Project guidance

- [AGENTS.md](AGENTS.md): instructions, package boundaries, workflow and safety invariants.
- [DESIGN.md](DESIGN.md): engineering design, assumptions, threat model and implementation status.
- [AI-LOG.md](AI-LOG.md): actual AI mistakes, decisions and verification evidence.
- [Project skills](docs/SKILLS.md): relevant skills, pinned sources and version limits.

## Start

Requires Bun 1.3.14 and Docker with Compose. From the repository root:

```sh
bun install --frozen-lockfile
bun run db:up
bun run db:migrate
bun run db:seed
bun run dev
```

- Web: <http://localhost:5173>
- API health: <http://localhost:3000/healthz>
- API documentation: <http://localhost:3000/openapi>

The sample inbox requires Postgres, but no model API key. New test enquiries require `OPENAI_API_KEY` in the root `.env` for automatic drafting; missing configuration produces a visible failure. The worker runs alongside the API and web app. App construction, OpenAPI generation, unit tests and builds still work without a database. A failed database connection returns a generic 503 rather than substituting sample state.

## Try the complete local workflow

1. Set `OPENAI_API_KEY` in the root `.env` and start `bun run dev` (web, API and worker). Keep the key out of Git and browser variables.
2. Open the app and click **Test enquiry**. Submit the provided example or write your own synthetic customer message. The form keeps your channel and customer identifier when reopened in the same business, so follow-ups/corrections continue that conversation. Change the identifier to test a different customer; refreshing or switching businesses resets the form.
3. Watch **Queued for drafting → Preparing draft → Needs approval**. The worker calls OpenAI, code calculates prices/policy, and the inbox follows the new draft automatically.
4. Inspect the request interpretation, quote, missing details and reply. Choose a named approver, edit wording if needed, then approve and confirm. Changing commercial numbers is rejected.
5. Watch **Approved → Sent · simulated**. The saved simulation ID proves that the approved reply reached the local delivery ledger. **No real WhatsApp, email or web-form reply is sent.** Rejection/handoff creates no send intent.
6. Select **Approved** or **All messages** to reopen the result. Refreshing or restarting the processes preserves reviews and simulated deliveries. **Superseded** shows previous versions.

Use [copy-and-paste test enquiries](docs/TEST-ENQUIRIES.md) for the 12 distinct original messages, form settings and expected checks, including the two-step laptop correction.

To replay the original challenge events through the same local adapter while the app is running:

```sh
bun run replay:seed
```

Each invocation records receipts; provider message IDs deduplicate messages/jobs. Seeded messages already in the inbox are duplicates and do not trigger another model call. New events are queued and can incur OpenAI usage. Replay never resets data. Customer `metadata.tenant_id` cannot override configured receiving ownership; unknown destinations fail closed.

Six hand-authored scenarios are based on challenge seed events `evt_0001/0002/0003/0005/0008/0009`. Customer bodies, sender identities and receive timestamps come from the original events; initial request extraction is hand-authored. **Generate AI draft** replaces a pending sample with a new version extracted by OpenAI. Both paths use the deterministic pricing/policy service and controlled reply templates; the UI identifies the catalogue and engine version. Existing approved samples retain their historical wording/evidence and may be labelled legacy. New enquiries trigger OpenAI automatically when a key is configured; existing samples change only through explicit generation. Evaluation scores, real channel delivery and production authentication are not implemented. The approver picker is a demo identity selector. Decisions and edits survive browser reloads and API restarts. Repeating the seed preserves decisions and refreshes only unreviewed sample calculations/templates, advancing their record revision when changed. Two competing reviewers cannot both complete a decision. Reply edits are local until a decision is recorded; navigating to another message discards unreviewed edits.

The Elysia inbox module calls durable services in `packages/core`, using the restricted application role and forced tenant RLS. The local operator is explicitly allowed Qamar and Rimal; the URL and reviewer picker do not establish authenticated identity. Before approval and simulated dispatch, the service recomputes the stored request against its catalogue version and current policy. Changed configuration requires regeneration; blocked/unassessed drafts cannot be approved. Free-text edits cannot change numeric facts or currency, but semantic wording still needs human review. AI regeneration creates a new held version; a structured-request editor is not implemented. Sample refresh uses `bun run db:seed`. Activity and Settings are reserved for later steps.

## Inspect quality and trust evidence

Open **Quality & Trust** in the sidebar (`/businesses/:tenantId/quality`). It shows the latest 50 saved AI attempts for the selected business across model/prompt versions, their outcomes, known estimated costs and named draft-review decisions. Filter outcomes and select an enquiry to inspect its message, prepared reply, quote, model/prompt, timing, usage and failure category. Failed regeneration has no new reply or review attributed to it. Unknown cost stays unknown; the total includes only recorded estimates. Seed samples without an AI attempt are not counted.

Inspection is read-only and makes no model call. Switching businesses preserves the page while resetting filters and selection. Trust remains **Supervised**: versioned evaluation cases, baseline/candidate runs, human-labelled judge calibration and named promotion are not implemented. The readiness checklist shows these gaps; operational approvals are not evaluation labels or measured quality scores.

## Workspace

```text
apps/
  api/       Elysia API and OpenAPI export
  web/       Vite, React, Tailwind, shadcn/ui, generated Hey API client
  worker/    Background worker entry point
packages/
  db/        Postgres/Drizzle schema, migrations, seeds and tenant-scoped access
  core/      AI drafting, durable review, exact pricing/policy, reply templates and Zod contracts
scripts/
  with-env.ts
```

The database and core packages export TypeScript source directly. Their code is bundled by the applications that use them. AI and shared utilities live inside `core`, rather than separate workspace packages.

## Database setup

With Docker running, initialize local Postgres from the repository root:

```sh
bun run db:up
bun run db:migrate
bun run db:seed
```

This starts PostgreSQL 18.6 on `127.0.0.1:5433` with persistent storage and separate application/migration roles. It loads the original Qamar/Rimal configuration, four approvers, five channel mappings and twenty versioned catalogue rows. All thirteen domain tables force tenant row-level security. Seeding also loads six sample drafts with their original messages. Conversations, messages, draft revisions, append-only receipts/reviews, outbox intent and a simulation ledger form the durable workflow. The migration command also initializes pg-boss 12.38.0 in its own schema; runtime processes do not migrate it.

Run `bun run db:test` for real Postgres isolation/integrity tests against a separate test database. Ordinary `bun run check` remains key-free and does not need a database server. See [database usage and boundaries](packages/db/README.md) and [original seed provenance](seed/README.md).

## Pricing and policy

`packages/core/src/pricing` calculates from the tenant's stored catalogue; model-provided prices are not an input. Decimal strings use scaled bigint arithmetic, including Arabic/Persian digits. Lines, invoice discount and VAT round half-up; currency display preserves exact minor digits.

- Qamar: monthly/purchase rates, inclusive discount threshold, configured rental limits, service-area handoff and delivery once per order.
- Rimal: day rates, stage area converted to 2 m² decks, required crew once per order, delivery per confirmed trip, budget warnings and the minimum after discount/before VAT.
- Unknown products, quantities, duration and delivery details remain explicit. A “better price” request applies no invented discount.
- Firm quotes remain held for named approval. The pure policy gate tests low risk + tenant enablement + autonomous trust; runtime trust remains supervised and no sender runs.

Try Rimal's LED request: the computed partial total is **SAR 12,604**, above its SAR 9,000 budget, with delivery unresolved. Editing the reply total to SAR 1.00 is rejected without saving a review. Abu Dhabi requests are blocked from approval and can be handed off. The graduation request derives twelve stage decks and one crew allocation.

## Generate an AI-assisted draft

Set `OPENAI_API_KEY` in your local root `.env`, then restart `bun run dev`. The key stays on the API server; never use a `VITE_` prefix or commit `.env`. The sample workflow remains available without a key.

1. Select a pending enquiry and click **Generate AI draft**. Each explicit attempt makes at most one provider call.
2. OpenAI receives only that business's product names/identifiers, FAQ and the customer's conversation. It extracts the request with a strict Zod-derived schema; it does not supply prices, send permissions or trust.
3. Code calculates the quote, applies policy and assembles the English/Arabic reply. The new version is marked **AI prepared** and remains pending named review. The previous version stays under **Superseded**.
4. Inspect the extracted details, missing information, quote and reply before reviewing. Model interpretation can still be wrong. Approval creates pending outbox intent, which the worker processes through the local send simulator.

The initial model is pinned to `gpt-5.4-mini-2026-03-17`, configurable through `OPENAI_MODEL`. This is a starting choice, not an evaluated quality claim. Integration uses the official [Responses API with Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), a 45-second timeout, a 3,000-output-token cap and no automatic retries or tools. Attempts persist model/prompt versions, an input hash, response ID, usage, timing, output and failure category in tenant-scoped `ai_runs`. Cost is an estimate from [standard model pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini); unknown model overrides and failed calls without usage remain unpriced.

One active attempt per message prevents competing calls. The provider runs outside database transactions; before saving, code rechecks the message, source revision and pricing context. A review or correction during inference takes precedence. Failures leave the current draft unchanged. An interrupted attempt becomes retryable after 90 seconds on an explicit request; queued processing uses the same service. The worker marks expired/interrupted attempts failed and requires an explicit retry rather than silently repeating a paid call.

## Receiving, queue and simulated delivery

The loopback-only `POST /local/events` adapter resolves a business from its configured channel/destination within the local operator scope. It saves a receipt for every known delivery, including duplicates/conflicts. A new message, conversation sequence, placeholder draft and pg-boss job commit in one transaction using pg-boss's Drizzle adapter. A queue insertion failure rolls everything back. Jobs contain only tenant/draft identifiers and a revision, not customer text or catalogue data.

The worker uses the restricted application role with schema migrations disabled. One initial attempt is allowed per job (no automatic paid retries); provider calls occur outside database transactions. Failed work stays visible and can be retried explicitly. Unstarted/abandoned work becomes a visible failure after 90 seconds while the worker is running. New customer messages supersede unreviewed replies; late model results cannot overwrite current work.

A recoverable outbox scan runs every second. Before simulated dispatch, the worker locks the conversation and rechecks named approval, the latest message/draft, pricing/policy and edited commercial facts. A new correction or changed configuration cancels the send. One append-only ledger row per outbox intent makes repeated/concurrent dispatch idempotent. The ledger stores the exact approved reply, destination, simulation ID and time. This local adapter has no external sending capability; exactly-once delivery to a real provider is not claimed.

The `pgboss` schema is system coordination data and contains identifiers/job outcomes. Business receipts, customer text, drafts and deliveries remain in forced-RLS domain tables. The app role has queue DML privileges but no schema creation/ownership; setup uses the migration role. Production adapter authentication, provider delivery/reconciliation, queue load testing, spend controls and measured evaluations remain future work.

## Web structure and routes

```text
apps/web/src/
  api/          Generated Hey API client (ignored; do not edit)
  components/   Reusable, prop-driven UI; stock shadcn primitives in ui/
  widgets/      Composed UI with data and interaction logic, grouped by domain
  pages/        Route entry points that compose widgets
  hooks/        Reusable React behavior and query/state hooks
  libs/         Non-React helpers: dates, money, status labels and cn
  routes/       React Router route tree and URL builders
  types/        Type aliases derived from generated API contracts
```

React Router uses declarative routes; TanStack Query and Hey API continue to own server data. The shared workspace layout resolves the URL's business and supplies it to nested pages. The inbox page loads lazily, with a skeleton inside the shared shell while its code loads. Business switching changes the URL, so direct links, reloads and browser Back/Forward retain the business. `/businesses/:tenantId` redirects to its inbox; unknown pages and business IDs show a not-found view. Navigation does not provide authentication or authorization.

Business changes reset the reviewer, filters, selection and unsaved edits while preserving the current Inbox or Quality & Trust page. Message selection and filters remain local UI state for this step. Activity and Settings remain disabled until implemented. Use `routes/paths.ts` for navigation links. When adding a page, register it in `routes/index.tsx` and compose its widgets in `pages/`.

Date formatting uses date-fns and `@date-fns/tz` through `libs/date.ts`. API timestamps retain their offsets and are displayed in the business's timezone (Dubai or Riyadh), regardless of the reviewer's computer timezone. A production static host must serve `index.html` for client routes; Vite already provides this fallback locally.

## API contract

The API follows [Elysia's feature-module guidance](https://elysiajs.com/essential/best-practice.html):

```text
apps/api/src/
  index.ts                  Listening process and shutdown
  app.ts                    App factory, plugins and module composition
  openapi-export.ts         Spec export without a listening server
  modules/
    health/
      index.ts              Elysia controller
      model.ts              Zod response schema
    inbox/
      index.ts              Elysia controller and HTTP outcome mapping
      model.ts              Shared core Zod contracts exported for HTTP
      index.test.ts         HTTP validation, failure and status mapping checks
```

Controllers use inline handlers, destructure request values and call services without passing Elysia's `Context`. The inbox controller maps core outcome codes to HTTP statuses. Runtime startup injects a core service backed by the application database URL. Stateless modules such as health need no service file.

Shared business services live in `packages/core/src/<feature>/`, where API and worker can both call them; database schema and access remain in `packages/db`. Add feature-local services or request-dependent Elysia plugins only when needed, without duplicating core logic or adding forwarding wrappers. The guide's TypeBox examples are adapted to our agreed Zod contracts.

Elysia routes use Zod for request/response validation. The OpenAPI plugin converts those schemas with `z.toJSONSchema` to generate `apps/api/openapi.json`. Hey API generates the typed SDK and TanStack Query helpers in `apps/web/src/api/`.

The spec belongs in Git; the generated client is ignored. Turbo automatically exports the spec and generates the client before web development, typechecking, and builds. The spec exporter does not start a server or require a database.

After changing a route during an existing development session, refresh the client with:

```sh
bun run api:generate
```

## Commands

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the development apps |
| `bun run build` | Build the three apps |
| `bun run typecheck` | Check all five workspace packages |
| `bun run lint` | Check formatting and lint rules |
| `bun run format` | Format source files |
| `bun run openapi:export` | Export the API specification |
| `bun run api:generate` | Export the specification and generate the web client |
| `bun run db:up` / `bun run db:down` | Start local Postgres / stop it while preserving the volume |
| `bun run db:generate` | Generate a migration from the Drizzle schema |
| `bun run db:migrate` | Apply reviewed domain migrations and initialize pg-boss using the migration role |
| `bun run db:seed` | Seed original configuration/catalogues and six persisted sample drafts |
| `bun run db:test` | Run real Postgres isolation, approval race and atomic rollback tests |
| `bun run replay:seed` | Submit the original events to the local adapter; new messages trigger worker drafting |
| `bun run test` | Run HTTP contract, Unicode edit, business-date and source-decimal tests |
| `bun run check` | Run lint, typechecking, tests, and builds |

## Configuration

Copy `.env.example` to `.env` only if you want to change the defaults. The root environment wrapper forwards configuration to Turbo; task environment variables are explicitly listed in `turbo.json`. Vite reads frontend configuration from the root and exposes only `VITE_*` variables to the browser.

UI uses [shadcn preset b7BFf3k1o](https://ui.shadcn.com/create?preset=b7BFf3k1o): Radix Nova shapes and spacing, Mist base/chart colors, Teal primary actions, Inter font and Lucide icons. Semantic status badges extend the preset. Theme colors are defined in `apps/web/src/index.css`; badge variants use those tokens. Measured evaluation/trust evidence remains planned. Queue processing and local simulated dispatch are implemented. AI request extraction is implemented; general model-written wording and semantic grounding still need evaluation. Prioritize a verifiable working flow before optional depth or additional screens.
