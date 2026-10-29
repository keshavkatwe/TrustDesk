# TrustDesk

The initial Turborepo workspace for the Trust Desk engineering challenge. This step sets up the project foundation; it does not implement the message pipeline yet.

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

No database or API key is needed for this boilerplate. The worker is a placeholder; no queue consumers run yet.

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
| `bun run check` | Run lint, typechecking, and builds |

## Configuration

Copy `.env.example` to `.env` only if you want to change the defaults. The root environment wrapper forwards configuration to Turbo; task environment variables are explicitly listed in `turbo.json`. Vite reads frontend configuration from the root and exposes only `VITE_*` variables to the browser.

UI components use shadcn/ui defaults. Application features, database setup, queue processing, and AI integration will be added in subsequent steps.
