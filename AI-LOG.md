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

These were identified by the user where stated, or by AI-assisted source review and tools. They are not claimed as human-labelled eval outputs.

## Verification and trust

For boilerplate `d63dc9f`: frozen dependency install, Biome, all workspace/root TypeScript checks, all three application builds, and browser verification of the generated client's live API connection passed. The local OpenAPI documentation also loaded. No domain, database, concurrency, judge-calibration or regression result exists yet.

For the Zod schema change: `bun run check` passed and the OpenAPI/Hey API pipeline regenerated successfully. An in-memory API smoke check verified the real health response, missing-route 404, and exported health schema. A temporary Elysia/Zod integration probe accepted valid input, rejected invalid input with 422 before calling the handler, and rejected invalid response data with 422. The probe added no application endpoint or permanent test fixture.

Independent manual verification by the user has not been recorded. The human calibration required by the challenge remains future work. Keep model/version choices, evaluation acceptance, tenant promotions, and approval of business commitments explainable and attributable; do not fabricate human judgment or evidence to complete a document.
