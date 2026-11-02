# AI usage log

## Tools and shaping instructions

Codex assisted with implementation, source review, test design, debugging and documentation. Official Elysia, Drizzle, pg-boss, OpenAI and shadcn documentation and the project-local skills informed the work. Browser automation verified the local UI. The application itself uses OpenAI for structured request extraction and, separately, evaluation judging.

| Instruction | Implementation |
| --- | --- |
| Use Vite/Turborepo, a separate database package and shared core services. | Web, API and worker applications share plain backend services; business logic has no HTTP or React dependency. |
| Use Elysia feature modules, Zod, OpenAPI and Hey API. | Thin controllers export validated contracts; the web uses generated SDK/query helpers. |
| Keep stock shadcn with the selected preset. | Existing component geometry and Mist/Teal/Inter theme are preserved; RTL and semantic states are functional additions. |
| Prefer Drizzle relations and readable, pure business decisions. | Scoped relational reads, explicit transaction/lock boundaries, pure pricing/evaluation rules and named persistence steps; SQL remains for locks, mutations and projections. |
| Build submission value around the complete decision/proof trail. | Receive → draft → code decision → review/outbox → real evaluations, calibrated-human review UI and version-bound trust; channel delivery remains simulated. |

## Actual errors and corrections

| Error | Detection and correction |
| --- | --- |
| Initially proposed Eden instead of the requested OpenAPI/Hey API contract. | Compared with the requested structure and used exported OpenAPI/generated clients. |
| A Drizzle bigint column default did not serialize into a valid migration. | Inspected generator output, replaced it with a SQL literal and verified migrations in real Postgres. |
| Failed regeneration could misattribute an old draft to the latest attempt's model/usage. | Added separate originating-run provenance and a Postgres regression. |
| Real evaluation runs found Arabizi classification, dropped dates, incorrect pickup/duration extraction and repetitive Arabic questions. | Preserved failed reports; improved extraction instructions/reasoning, date/context fields and distinct Arabic clarification labels. No threshold was lowered to accept these outputs. |
| The judge sometimes contradicted minor-unit totals or ignored code-added missing questions. | Revised its rubric and supplied one consolidated final draft, with stronger reasoning. Real outputs, rationales and earlier failures remain stored; independent calibration is still required. |
| JSONB reordered nested parameter keys, creating a false configuration mismatch. | Added value-based canonical comparison and a regression covering reordered keys versus genuinely changed reasoning parameters. |
| The human-label response parser rejected internal tenant/run columns. | Real concurrent-label tests exposed the projection error; corrected the response boundary and verified label races/promotion guards. |
| Successful promotion left the dialog open with weak feedback and allowed repeated submissions. | Close after success, show the saved promotion with reviewer/time, replace the promoted form with a status message, and expose pending/error states. Isolated browser checks covered rejection, retry, success and reopening without changing business trust history. |

## Executed evidence

- `bun run check`: lint, workspace/root types, 49 unit/HTTP tests and application builds passed.
- `bun run db:test`: 75 real Postgres tests passed under separate restricted app/migration roles. They cover forced RLS, omitted/wrong filters, composite references, duplicate intake, correction ordering, competing reviews, atomic rollback, attempt recovery, source precision and settings locks.
- Evaluation-specific database checks cover immutable human labels, one winner under concurrent labelling, guarded named promotion, automatic supervision, one automatic FAQ intent/result, and cancellation when trust is revoked before dispatch. A private canary stays out of another business's prompt, saved attempt and UI payload; a deliberately mixed context fails before inference.
- Final real baselines passed 32/32 cases, including 16/16 Arabic/mixed/Arabizi cases. The matching deliberately degraded runs passed only Qamar 5/16 and Rimal 6/16, with zero Arabic passes, and were blocked. `bun run eval:verify` recomputes those stored gates without a key.
- Twenty saved measured reports retain successes and failures. Their known estimated provider cost totals USD 1.433768400; estimates are not billing receipts. Mock inference is used only in automated tests, never as measured-run or human evidence.
- Key-free evidence import was run twice against the isolated test database and showed current 16/16 baselines for both tenants. Temporary imports were removed afterward; development conversations were preserved.
- Browser verification checked current-version badges, independent human-review fields, judge masking, Arabic/currency presentation and overflow. Workflow approvals and test fixtures were not counted as independent human labels.
- Exported ten actual saved human labels, five per business, with 15/15 dimension agreements per business and the named promotion history. References were checked against the committed accepted runs. Qamar's operational history also contains an automatically approved FAQ with simulated delivery; Rimal automatic sending remains off.


## Delegation limits

AI does not authorize commercial commitments or its own promotion. Code owns source money/policy; named humans own held replies, independent labels and promotion. Production authentication, real delivery/reconciliation, deployment/release decisions and independent bilingual judgement remain accountable human work. A passing curated run does not establish statistical reliability, and same-family generator/judge errors can correlate.
