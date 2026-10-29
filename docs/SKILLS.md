# Project skills

Project-local skills live in `.agents/skills/`; their contents are vendored for review and availability on a clean clone. This installs development guidance, not runtime agent frameworks. Read only the skill and references needed for the current task.

## Sources

| Installed directory | Source | Pinned revision | Reason |
| --- | --- | --- | --- |
| `turborepo` | [vercel/turborepo](https://github.com/vercel/turborepo/tree/e158e859f804019fa48dd1af15bc247e4759d81e/skills/turborepo) | `e158e859f804019fa48dd1af15bc247e4759d81e` | Task graph, caching, environments and workspace boundaries. |
| `elysiajs` | [elysiajs/skills](https://github.com/elysiajs/skills/tree/8fd8031b83bce42e903ed0e38e6170213876c20e/elysia) | `8fd8031b83bce42e903ed0e38e6170213876c20e` | Version 1 routing, validation, OpenAPI and testing. Current upstream targets Elysia 2 and must not silently replace this copy. |
| `shadcn` | [shadcn-ui/ui](https://github.com/shadcn-ui/ui/tree/96da9cc7f1aa10580a3741664e2a77c721206c00/skills/shadcn) | `96da9cc7f1aa10580a3741664e2a77c721206c00` | Default component composition, installed-component APIs and accessibility. |
| `supabase-postgres-best-practices` | [supabase/agent-skills](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices) | `c9be0e931b7930f7d02126d04774d904c381e7d7` | Postgres schema, isolation, indexes, locking and query guidance; applies to plain Postgres. |

Only the selected skill directories are installed. Keep their supporting references with them. Treat upstream examples as guidance; repository decisions in `AGENTS.md` and `DESIGN.md` remain authoritative for this project.

## Deliberate limits

- Use Zod for application validation and inferred types, even when upstream examples use TypeBox. Elysia's OpenAPI plugin maps Zod via `z.toJSONSchema`.
- Do not introduce Eden, Supabase hosting/auth, a new UI theme, or Elysia 2 as an incidental consequence of a skill.
- The Turborepo skill prefers bundled documentation. Turbo 2.11.4 currently has no `docs/README.md`; fall back to official documentation and installed configuration/types, without upgrading the package merely to satisfy the skill's documentation path.
- Use the shadcn CLI from `apps/web` and preserve stock components and preset. `DESIGN.md` here is an engineering design, not a request to create a new visual design system.
- Consult official, version-matched [Drizzle](https://orm.drizzle.team/docs/overview), [Hey API](https://heyapi.dev/openapi-ts/get-started), [pg-boss](https://pgboss.io/), and [OpenAI](https://developers.openai.com/api/docs/) documentation when implementing those integrations. The existing OpenAI Docs skill can assist when available.
- Broader design, deployment, agent-framework and skill packs are unnecessary for the agreed scope. Add a skill only when a concrete task needs it; do not automatically update pinned copies.

## Reinstalling a selected skill

The initial installation uses the Codex skill-installer helper with a project-local `--dest`, an exact `--ref`, and, for Elysia, `--name elysiajs`. The installer aborts if the destination already exists. Existing checked-in skill files require no installation command for a normal clone.

The project's Git history and the upstream revisions above record provenance; no global skill installation or generated runtime dependency is required.
