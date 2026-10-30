# AI working log

This records observed work, not independent human calibration. Update it as the project develops.

## Tools and scope

Codex inspected the challenge and Pushwing reference structure, discussed stack choices, scaffolded the workspace, and ran automated/build/browser checks. Web documentation informed library and skill selection. The application has not made an OpenAI inference call yet.

## Instructions that shaped the build

- Use Vite, Postgres/Drizzle, Elysia, pg-boss, Tailwind and shadcn, with Turborepo.
- Use stock shadcn components with no visual redesign.
- Follow Pushwing's OpenAPI + Hey API structure rather than Eden.
- Keep `db` separate; put AI and utilities inside `core` rather than adding more workspace packages.
- Work step by step and commit only when asked. The boilerplate was committed as `d63dc9f` after the user requested it.

Subsequent schema decision: the user chose Zod instead of TypeBox. The health contract and project guidance now use Zod; the Elysia OpenAPI plugin explicitly registers `z.toJSONSchema` so Hey API continues to generate the frontend client.

## Observed AI mistakes and corrections

| Mistake | How it was detected | Correction |
| --- | --- | --- |
| Suggested `render={<h1 />}` on the Radix shadcn `CardTitle`, which accepts div props. | Reading the generated component exposed the mismatch; Biome also rejected the empty heading. | Use an actual heading as the title's child. |
| Passed `radix-nova` as a CLI preset name. | The CLI rejected it and listed valid preset names. | Use `--base radix --preset nova`; the resulting component configuration uses `radix-nova`. |
| Returned widened strings from the Elysia health handler while declaring literal response fields. | TypeScript rejected the handler against the response schema. | Preserve literal types with `as const`, then rerun checks. |
| Initially recommended Eden before examining the user's preferred Pushwing pattern. | The user specified OpenAPI + Hey API; inspecting Pushwing confirmed that contract pipeline. | Adopt Elysia schemas -> exported spec -> Hey API SDK/query helpers. |
| Used an intrinsic-width shadcn FieldGroup for the approver picker; its container sizing caused the narrow header to overflow. | Browser screenshot at a 544px preview width. | Give the group an explicit responsive width so it wraps on narrow screens. |
| Treated test response JSON as already typed, and inferred action/state test pairs as general arrays. | Strict TypeScript rejected unknown response bodies and potentially undefined tuple members. | Parse responses with the Zod contract and preserve literal test pairs with `as const`. |
| Kept the review scroll container mounted across message changes. | Browser checks showed a new selection could inherit the previous message's scroll position. | Key the review region by message and revision so the status and request open at the top. |
| Used a JavaScript `0n` bigint as a Drizzle column default. | Drizzle Kit reported a bigint serialization error while generating a migration, despite exiting with status zero. | Use the SQL literal default `sql` + `` `0` ``; inspect the generated SQL and apply/test the real migration rather than trusting exit status alone. |

These were identified by the user where stated, or by AI-assisted source review and tools. They are not claimed as human-labelled eval outputs.

## Verification and trust

For boilerplate `d63dc9f`: frozen dependency install, Biome, all workspace/root TypeScript checks, all three application builds, and browser verification of the generated client's live API connection passed. The local OpenAPI documentation also loaded. No domain, database, concurrency, judge-calibration or regression result exists yet.

For the Zod schema change: `bun run check` passed and the OpenAPI/Hey API pipeline regenerated successfully. An in-memory API smoke check verified the real health response, missing-route 404, and exported health schema. A temporary Elysia/Zod integration probe accepted valid input, rejected invalid input with 422 before calling the handler, and rejected invalid response data with 422. The probe added no application endpoint or permanent test fixture.

The user reviewed the UI, gave layout/theme feedback, and approved its visual direction. Independent manual verification of technical checks has not been recorded. The human calibration required by the challenge remains future work. Keep model/version choices, evaluation acceptance, tenant promotions, and approval of business commitments explainable and attributable; do not fabricate human judgment or evidence to complete a document.

For the UI-first prototype: `bun run check` passes lint, all TypeScript checks, eight fixture API tests (57 assertions), and application builds. API tests cover tenant-scoped reads/writes, approver ownership, invalid input, stale/superseded drafts, competing in-memory decisions, edit attribution, required rejection/handoff reasons, fresh app state, and fixture arithmetic. These are disposable-adapter checks, not Postgres isolation, a pricing engine, distributed concurrency, or AI-quality evidence. Browser checks exercised an edited Arabic approval, named handoff with a reason, business/reviewer reset, search empty state, status filters, superseded-to-current navigation, and layout at 390px, 544px, 900px and 1280px. No page-wide horizontal overflow was observed at the measured widths. Stock component/theme styling is preserved.

UI review feedback: compacted the inbox controls into two rows without changing the component theme. At the user's 889px viewport, the toolbar measures 84px instead of 144px, freeing 60px for messages. Browser checks confirmed search filtering, the longest status label, empty state and refresh still work without page-wide overflow. `bun run check` and `git diff --check` passed; changes remain uncommitted.

Further UI review: removed the brand Sample badge, officer-status block and sample banner, and moved the business switcher into the sidebar footer. The user explicitly requested color, superseding the initial neutral-theme choice. Adopted the official shadcn Blue theme tokens over the Neutral base and added semantic badge variants for pending (amber), approved (green), handoff/edited (blue) and rejected (the stock destructive variant). Radix Nova geometry and typography remain intact. Sources: shadcn theming documentation and `shadcn-ui/ui/apps/v4/registry/themes.ts`. New light badge color pairs calculate at least 4.72:1 contrast; blue action text calculates at 6.26:1. `bun run check` passed. Browser verification at 889×760 and 390×844 confirmed footer switching, upward options, reviewer reset, removed sections, colored action controls and no page-wide horizontal overflow. No decisions were submitted during this visual check. Changes remain uncommitted.

Preset selection: the user chose `b7BFf3k1o`. The official shadcn CLI decoded it as Nova, Mist base/charts, Teal theme, Inter font, Lucide icons, default radius, subtle menu accent and default menu color. Applied `--only theme,font` because all other preset fields already matched, preserving the application layout and semantic badge extensions. Removed the unused Geist import/dependency. The CLI resolves the final project to exactly `b7BFf3k1o` with no fallbacks. `bun run check` and `git diff --check` passed. Browser checks confirmed Inter font-face availability, the expected Teal primary action color, Arabic review controls, the bottom-left business selector and no page-wide horizontal overflow at 363px and 889px. No decisions were submitted. Changes remain uncommitted.

The UI prototype, including the reviewed preset, was subsequently committed as `7a02981` at the user's request.

Web routing step: followed the user's `components` / `widgets` / `pages` / `hooks` / `libs` convention, with `routes` for configuration and `types` for generated-contract aliases. Added React Router 8.5.1 in declarative mode, business-scoped inbox URLs, root/business-index redirects, a shared layout and not-found views. The first available business is the documented default. The inbox page loads lazily. Added date-fns 4.4.0 and `@date-fns/tz` 1.5.0; message/decision dates use the business timezone. References: [React Router routing](https://reactrouter.com/start/declarative/routing) and [date-fns timezone context](https://github.com/date-fns/tz#tz).

`bun run check` passed lint, all TypeScript checks, 11 tests (62 assertions), and application builds. The three date tests cover Dubai/Riyadh midnight differences, explicit API offsets and year rollover; they also passed with `TZ=America/Los_Angeles`. Browser checks covered default and business-index redirects, direct business URLs, reload, Back/Forward, unknown pages/business IDs, recovery links, reviewer/filter/unsaved-edit reset on business navigation, reply editing, and mobile Arabic list/review/back/sidebar switching. The sidebar closed after mobile business navigation. No page-wide horizontal overflow was measured at 390px or 889px. A fresh reload produced no new console errors or warnings; earlier development reload errors occurred while paths were being moved. No review decisions were submitted. The user approved committing this step on 30 October 2026.

The web routing step was committed as `84e3776` at the user's request.

Elysia structure: the user selected the [official best-practice guide](https://elysiajs.com/essential/best-practice.html). Read that guide and the project's Elysia skill, then moved the fixture API into `modules/demo/` with an Elysia controller in `index.ts`, Zod contracts in `model.ts`, pure fixture behavior in `service.ts`, and colocated HTTP tests. Moved health into its own controller/model module. The app factory composes modules; the listening process remains separate. Demo service results now use plain outcome codes, mapped to the same HTTP statuses by the controller. Shared business services remain planned in `packages/core`; no database setup was included in this structure step.

Regenerated OpenAPI and Hey API successfully; the tracked OpenAPI specification is byte-for-byte unchanged. `bun run check` passed lint, all TypeScript checks, all 11 tests (62 assertions), and builds. The existing HTTP tests still cover tenant/reviewer scoping, invalid requests, stale and superseded drafts, competing in-memory reviews, required reasons and fresh state per app. Additional in-process smoke checks confirmed health, CORS and missing-route 404 behavior without starting a server or requiring database/provider credentials. Project instructions and README now record the feature-module convention and the shared-core boundary. Changes remain uncommitted.

The Elysia structure step was committed as `06a1af0` at the user's request before starting database work.

Database foundation: read the project Postgres/Turbo skills, official Drizzle and PostgreSQL documentation, and reread the source artifact's tenant/catalogue/event tabs through the browser. Preserved the original two-tenant configuration, twenty price rows and thirteen events under `seed/`. Added Docker Compose PostgreSQL 18.6, Drizzle ORM 0.45.4 / Kit 0.31.11, node-postgres 8.23.1, Zod-validated configuration/source data, reviewed schema/security migrations and repeatable per-business seeding. Application and migration roles have no superuser/RLS-bypass privilege; all five business tables force RLS. Transaction-local tenant context and composite keys protect the foundation queries. Runtime catalogues are read-only. UI remains on the disposable fixture adapter; no message/review persistence, queue, inference or API/database integration is claimed.

Validation: `bun run check` passed lint, all TypeScript checks, thirteen unit/API tests (68 assertions) and all application builds. `bun run db:test` passed twelve real Postgres integration tests (86 assertions) against the separate `trustdesk_test` database. They cover restricted privileges, forced/default-deny RLS (including the table owner), omitted/wrong filters, cross-tenant writes, commit/rollback cleanup, reuse of the same pooled connection, concurrent tenant contexts, exact source rates and repeatable seeds/migrations, composite references, duplicate destinations and invalid prices. Restarted the development Postgres container and read both businesses' ten catalogue rows with the application role before reseeding, confirming volume persistence. This is foundation-level database evidence, not end-to-end canary, message dedupe, approval concurrency or AI evaluation evidence. The user reviewed the schema explanation and approved committing this database step on 30 October 2026.
