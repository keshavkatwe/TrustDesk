# TrustDesk

Turborepo workspace for the Trust Desk engineering challenge, with a Postgres-backed shadcn inbox, named reviews, saved edit history and atomic outbox intent. Draft generation and the receive/worker pipeline are still planned.

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

The inbox requires Postgres, but no model API key. The worker is a placeholder. App construction, OpenAPI generation, unit tests and builds still work without a database. A failed database connection returns a generic 503 rather than substituting sample state.

## Try the inbox

1. Open the web app. `/` redirects to the first business inbox, currently `/businesses/qamar/inbox`. The inbox defaults to **Needs approval**.
2. Choose a business from the bottom-left sidebar selector and a named approver from the header. On narrow screens, open the sidebar to change businesses.
3. Select a message, inspect the original request, quote and evidence, then edit or review the reply. Approval shows the original/edited wording before confirmation.
4. Approve, reject or hand off a draft. Rejection and handoff require a reason. **Approved does not mean sent**: approval saves a pending outbox record; delivery is not connected. Reopening the approved item shows its reviewer and outbox ID.
5. Select **Superseded** in the status filter to inspect the old 25-laptop request and open its 30-laptop correction. Search for an unmatched phrase to try the empty state.

Six hand-authored scenarios are based on challenge seed events `evt_0001/0002/0003/0005/0008/0009`. Customer bodies, sender identities and receive timestamps come from the original events; draft extraction, reasons and quotes remain hand-authored samples. Quote arithmetic uses sample catalogue values, not a pricing service. No OpenAI calls, evaluation scores, channel delivery or authentication run. The approver picker is a demo identity selector. Decisions and edits survive browser reloads and API restarts. Repeating the seed preserves existing decisions. Two competing reviewers cannot both complete a decision. Reply edits are local until a decision is recorded; navigating to another message discards unreviewed edits.

The Elysia inbox module calls durable services in `packages/core`, using the restricted application role and forced tenant RLS. The local operator is explicitly allowed Qamar and Rimal; the URL and reviewer picker do not establish authenticated identity. Edited commercial wording is not revalidated by a pricing engine yet. Quality & Trust, Activity and Settings are reserved for later steps.

## Workspace

```text
apps/
  api/       Elysia API and OpenAPI export
  web/       Vite, React, Tailwind, shadcn/ui, generated Hey API client
  worker/    Background worker entry point
packages/
  db/        Postgres/Drizzle schema, migrations, seeds and tenant-scoped access
  core/      Durable inbox/review services and shared Zod contracts
scripts/
  with-env.ts
```

The database and core packages export TypeScript source directly. Their code is bundled by the applications that use them. AI and shared utilities will be modules inside `core`, rather than separate workspace packages.

## Database setup

With Docker running, initialize local Postgres from the repository root:

```sh
bun run db:up
bun run db:migrate
bun run db:seed
```

This starts PostgreSQL 18.6 on `127.0.0.1:5433` with persistent storage and separate application/migration roles. It loads the original Qamar/Rimal configuration, four approvers, five channel mappings and twenty versioned catalogue rows. All ten tables force tenant row-level security. Seeding also loads six sample drafts with their original messages. Conversations, messages, draft revisions, append-only reviews and pending outbox entries form the durable inbox workflow.

Run `bun run db:test` for real Postgres isolation/integrity tests against a separate test database. Ordinary `bun run check` remains key-free and does not need a database server. See [database usage and boundaries](packages/db/README.md) and [original seed provenance](seed/README.md).

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

Business changes reset the reviewer, filters, selection and unsaved edits. Message selection and filters remain local UI state for this step. Quality & Trust, Activity and Settings remain disabled until implemented. Use `routes/paths.ts` for navigation links. When adding a page, register it in `routes/index.tsx` and compose its widgets in `pages/`.

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
| `bun run db:migrate` | Apply reviewed migrations using the migration role |
| `bun run db:seed` | Seed original configuration/catalogues and six persisted sample drafts |
| `bun run db:test` | Run real Postgres isolation, approval race and atomic rollback tests |
| `bun run test` | Run HTTP contract, Unicode edit, business-date and source-decimal tests |
| `bun run check` | Run lint, typechecking, tests, and builds |

## Configuration

Copy `.env.example` to `.env` only if you want to change the defaults. The root environment wrapper forwards configuration to Turbo; task environment variables are explicitly listed in `turbo.json`. Vite reads frontend configuration from the root and exposes only `VITE_*` variables to the browser.

UI uses [shadcn preset b7BFf3k1o](https://ui.shadcn.com/create?preset=b7BFf3k1o): Radix Nova shapes and spacing, Mist base/chart colors, Teal primary actions, Inter font and Lucide icons. Semantic status badges extend the preset. Theme colors are defined in `apps/web/src/index.css`; badge variants use those tokens. Queue processing, deterministic pricing/policy, AI drafting, simulated dispatch and measured evaluations remain planned. The deadline priority is a verifiable working flow before optional depth or additional screens.
