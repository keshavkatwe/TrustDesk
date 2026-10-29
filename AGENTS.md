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
- `apps/web`: React + Vite, Tailwind, stock shadcn/ui, TanStack Query, generated Hey API client.
- `apps/worker`: pg-boss consumers and worker lifecycle. Queue integration is planned, not implemented yet.
- `packages/db`: PostgreSQL connection, Drizzle schema, migrations, and tenant-scoped database access. Currently a placeholder.
- `packages/core`: business services shared by API and worker. AI, pricing, policy, approvals, and trust belong in modules here. Currently a placeholder.
- Applications do not import code from other applications. Backend packages do not depend on React or Elysia request context.
- Do not add separate `ai`, `shared`, or UI workspace packages without a demonstrated need and a design update.

## API and frontend conventions

- Use Zod for application schemas: HTTP contracts, configuration, core inputs, and structured LLM outputs. Derive TypeScript types with `z.infer` rather than maintaining duplicate interfaces.
- Elysia routes declare Zod request schemas, success/error response schemas, and stable `detail.operationId` values. Map Zod schemas to OpenAPI with `mapJsonSchema: { zod: z.toJSONSchema }`.
- Follow `apps/api/src/app.ts` and `openapi-export.ts`: constructing/exporting the app must not require a database, an OpenAI key, or a listening server.
- The contract is Elysia schemas -> `apps/api/openapi.json` -> Hey API -> `apps/web/src/api/` -> TanStack Query. Use OpenAPI and Hey API; do not replace them with Eden or tRPC.
- The OpenAPI specification is tracked; generated client files are ignored. Do not edit generated files or duplicate their DTOs by hand.
- Use generated SDK calls and query/mutation helpers for frontend API access. Keep runtime client configuration outside the generated directory.
- Use shadcn components, their defaults, and built-in variants. Preserve the current Radix Nova preset and default theme. Layout, accessibility, Arabic direction, and mixed-direction text handling are functional work; do not redesign the UI or restyle the component library.

## Domain invariants

- Resolve tenants from a verified receiving-channel mapping, not customer text or `metadata.tenant_id`. Unknown destinations fail closed. The local replay runner is a synthetic input adapter, not production webhook authentication.
- Scope business-owned reads, writes, prompts, logs, and screens by tenant. Use database constraints and RLS as specified in the design; test with a role that cannot bypass those controls.
- Identify a customer message by tenant + channel + channel message ID. Event receipts remain separately traceable. Enforce deduplication with database uniqueness and transactions, not a read-then-insert check.
- Recompute commercial values from versioned catalogue rows. Use exact decimal calculations and explicit rounding; finalized money is integer minor units. Never trust model-supplied prices or totals.
- Policy and trust decisions belong in code. The model cannot authorize discounts, availability, delivery, sending, or promotion.
- Firm quotes and commitments require named approval. Auto-send requires a low-risk reply, enabled tenant configuration, and autonomous trust for the evaluated agent version.
- Guard approval and dispatch against concurrent decisions and superseded draft revisions. Persist approval, edit diff, and outbox intent atomically.
- Use one structured LLM drafting step per message. No agent frameworks, tool loops, or multi-agent application architecture.
- Record invalid output, provider failures, policy reasons, versions, and costs honestly. Use bounded retries and account for each message; do not hide failures behind success states.

## Validation and evidence

Run the checks relevant to the change. `bun run check` currently runs lint, TypeScript checks, and builds. Add meaningful logic/database/browser tests as those features are implemented; do not invent test results or add tests that merely mirror a scaffold.

For API changes, regenerate the contract with `bun run api:generate`, inspect the spec, and exercise affected routes including rejection behavior. For UI behavior, verify the result in a browser. For database/concurrency changes, exercise real Postgres constraints, transactions, and the restricted application role.

Evals will use at least 30 versioned cases, three named judge dimensions, at least 10 genuinely human-labelled outputs, and stored baseline/degraded runs. Mock the LLM only in automated tests; stored real-run fixtures support the key-free demo. Never present synthetic judge labels as human calibration or placeholder data as measured evaluation evidence.

Keep `DESIGN.md` concise (the brief allows up to three pages) and update implemented status as work lands. Record actual AI mistakes and verification in `AI-LOG.md`. `REVIEW.md` and `TEAM-PLAN.md` are later submission deliverables, not completed work today.

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
