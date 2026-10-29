# TrustDesk

Turborepo workspace for the Trust Desk engineering challenge, with a stock shadcn inbox and review prototype. The message-processing pipeline is not implemented yet.

## Project guidance

- [AGENTS.md](AGENTS.md): instructions, package boundaries, workflow and safety invariants.
- [DESIGN.md](DESIGN.md): engineering design, assumptions, threat model and implementation status.
- [AI-LOG.md](AI-LOG.md): actual AI mistakes, decisions and verification evidence.
- [Project skills](docs/SKILLS.md): relevant skills, pinned sources and version limits.

## Start

Requires Bun 1.3.14. From the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

- Web: <http://localhost:5173>
- API health: <http://localhost:3000/healthz>
- API documentation: <http://localhost:3000/openapi>

No database or API key is needed for this prototype. The worker is a placeholder; no queue consumers run yet.

## Try the inbox

1. Open the web app. The inbox defaults to **Needs approval**.
2. Choose a business from the bottom-left sidebar selector and a named approver from the header. On narrow screens, open the sidebar to change businesses.
3. Select a message, inspect the original request, quote and evidence, then edit or review the reply. Approval shows the original/edited wording before confirmation.
4. Approve, reject or hand off a draft. Rejection and handoff require a reason. **Approved does not mean sent**; all actions are simulations.
5. Select **Superseded** in the status filter to inspect the old 25-laptop request and open its 30-laptop correction. Search for an unmatched phrase to try the empty state.

Six hand-authored scenarios are based on challenge seed events `evt_0001/0002/0003/0005/0008/0009`. Some messages are condensed and display times are illustrative. Quote arithmetic uses sample catalogue values, not a pricing service. No OpenAI calls, evaluation scores, channel delivery or authentication run. The approver picker is a demo identity selector. Changes are shared by browsers connected to the same API process and reset when that process restarts. Reply edits are local until a decision is recorded; navigating to another message discards unreviewed edits.

The fixture adapter lives in `apps/api/src/demo/` and uses the generated API client. It will be replaced with durable services in `packages/core` and `packages/db`. In-memory checks do not establish production isolation or concurrency guarantees. Quality & Trust, Activity and Settings are reserved for later steps.

## Workspace

```text
apps/
  api/       Elysia API and OpenAPI export
  web/       Vite, React, Tailwind, shadcn/ui, generated Hey API client
  worker/    Background worker entry point
packages/
  db/        Database package placeholder
  core/      Backend services package placeholder, shared by API and worker
scripts/
  with-env.ts
```

The database and core packages export TypeScript source directly. Their code is bundled by the applications that use them. AI and shared utilities will be modules inside `core`, rather than separate workspace packages.

## API contract

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
| `bun run test` | Run fixture API behavior and quote-integrity tests |
| `bun run check` | Run lint, typechecking, tests, and builds |

## Configuration

Copy `.env.example` to `.env` only if you want to change the defaults. The root environment wrapper forwards configuration to Turbo; task environment variables are explicitly listed in `turbo.json`. Vite reads frontend configuration from the root and exposes only `VITE_*` variables to the browser.

UI uses [shadcn preset b7BFf3k1o](https://ui.shadcn.com/create?preset=b7BFf3k1o): Radix Nova shapes and spacing, Mist base/chart colors, Teal primary actions, Inter font and Lucide icons. Semantic status badges extend the preset. Theme colors are defined in `apps/web/src/index.css`; badge variants use those tokens. Database setup, queue processing, AI integration and durable approvals will be added in subsequent steps.
