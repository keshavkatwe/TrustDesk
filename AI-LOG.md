# AI usage log

## Tools and scope

Codex assisted with repository setup, implementation, test design, debugging and documentation. Official framework documentation and the project's Elysia, Postgres, Turborepo and shadcn skills informed the work. Browser automation checked the local UI.

The application now supports explicit OpenAI request extraction through the Responses API. Code calculates prices/policy and assembles controlled replies; initial sample drafts remain clearly identified.

## Instructions that shaped the implementation

| Instruction | Result |
| --- | --- |
| Use Vite and Turborepo, with the database separate and shared backend logic in core. | Separate web, API and worker apps; database access in `packages/db`; review and pricing services in `packages/core`. |
| Use OpenAPI and Hey API, following the existing Pushwing pattern. | Elysia contracts export a tracked specification; Hey API generates the web SDK and TanStack Query helpers. |
| Use Zod instead of TypeBox for application schemas. | Request/response contracts, configuration and structured pricing inputs use Zod with inferred types. |
| Follow Elysia's feature-module guidance. | Thin feature controllers map core outcomes to HTTP responses; business services do not depend on Elysia context. |
| Use stock shadcn components and the selected preset. | Preserved component geometry and the Mist/Teal/Inter preset; composed the inbox and review screens from existing primitives. |
| Use Drizzle query APIs throughout application reads. | Defined composite tenant relations and converted services, recovery and seed reads to `findMany/findFirst`, using `with` for related data; retained row locks/predicate subqueries and verified exact top-level bigint reads. |

## AI errors and corrections

| Error | How it was detected | Correction |
| --- | --- | --- |
| Initially proposed Eden instead of the required OpenAPI/Hey API contract. | Comparing the proposal with the requested reference structure. | Used exported OpenAPI and generated SDK/query helpers. |
| Used a JavaScript bigint literal as a Drizzle column default. | Drizzle Kit reported a serialization error even though the command exited successfully. | Used a SQL literal default; inspected generated SQL and verified the real migration in Postgres. |
| A tenant-reference test initially used a draft ID where a message ID was needed. | Reviewing whether the test actually exercised a cross-business reference. | Created a real message in the other business and checked that the composite foreign key rejected the reference. |
| Initially displayed a draft’s model/usage from its latest generation attempt. | Reviewing failed regeneration showed it could misattribute an existing draft to a failed later call. | Separated originating-run provenance from latest-attempt status and added a Postgres regression test. |
| The review confirmation still said “not sent” after simulated dispatch completed. | Live browser verification exposed disagreement between the label and persisted delivery outcome. | Derived status and confirmation text from the saved delivery result. |
| Classified OpenAI timeouts by `error.name`, but SDK subclasses inherit `Error`. | Restricted-role regression tests reproduced timeout and connection failures being saved as generic provider errors. | Check SDK error classes and HTTP statuses; show actionable saved failure messages and preserve explicit retry without overwriting drafts. |
| Test enquiry regenerated the customer identifier whenever its dialog opened, splitting follow-ups into separate conversations. | Comparing saved customer identities with form state lifecycle. | Retain channel/customer in the parent widget while issuing a fresh message ID per opening; browser reopen checks and a four-message/one-conversation Postgres regression pass. |

## Verification evidence

The following checks were executed through Codex; they are not independent human sign-off:

- `bun run check`: formatting/lint, workspace and root TypeScript checks, 30 unit/HTTP tests and application builds passed.
- `bun run db:test`: 57 real Postgres tests passed using separate application and migration roles. Coverage includes forced tenant RLS, nested relational visibility/default-deny, colliding IDs across tenants, cross-business references, duplicate-message constraints, four different messages sharing one conversation, pooled tenant context, competing reviews, stale drafts, current-rule rechecks and atomic review/outbox rollback. Additional checks preserve source bigint values above JavaScript's safe range and filter recorded deliveries before the 25-item recovery limit. Drafting checks include one active call across pools, invalid/refused/truncated output, foreign SKUs, interrupted-run recovery, review-during-inference, preserved draft provenance after failure, version ordering and eight provider-error/retry cases without private exception text. New checks confirm late expired responses retain usage without replacing drafts, pricing changes during inference reject output, and recovery preserves active attempts and other businesses without requeuing work.
- Pricing tests cover exact rounding, source rates, discount thresholds, stage-deck conversion, mandatory crew, delivery basis, minimum orders, budgets and automatic-send eligibility.
- Browser checks exercised Arabic replies, business switching, mobile layout, computed quote evidence and rejection of an altered total. API-process restart verification confirmed persisted review/edit/outbox data. New drafting controls were checked at 390px and desktop width, including unsaved-edit protection.
- Two genuine OpenAI calls produced held drafts: five iPhones at AED 17,844.75 including VAT, and the corrected 30-laptop/three-month request at AED 17,010 excluding unresolved delivery. The latter retained prior conversation details and applied no invented discount. Model, prompt, usage and estimated cost were saved; these are smoke checks, not a measured quality baseline.
- Real Postgres/pg-boss checks cover atomic receipt/message/job rollback, concurrent duplicate deliveries, saved conflict receipts for changed content/sender, forged tenant metadata, correction supersession, configuration changes before dispatch, unique simulated sends and missing-provider failures. These checks also passed after simplifying receive, worker, drafting and dispatch flows with shared lock/run helpers and explicit transaction boundaries. Automated workflow tests inject a fake model and make no paid calls.
- A live browser run submitted a new two-iPhone enquiry, observed automatic worker drafting, approved it under the simulated named identity and verified `Sent · simulated` with a persisted simulation ID. The same result/ID survived a full process restart; the incoming form fit a 390px viewport without horizontal overflow, and a fresh browser load reported no new warnings/errors. This Codex-operated demo is not independent human evaluation/calibration.
- The local key is ignored by Git and was not found in the generated web build. Provider exception text is not persisted; only categorized failures and available usage are recorded.
- A failed Rimal test enquiry succeeded on one explicit live retry and was verified in the inbox. It requested clarification rather than substituting a catalogue chair type. Earlier generic error records cannot establish the exact historical provider failure.

Combined result: 87 tests passed. These engineering tests are distinct from the challenge's planned evaluation gold set.

Trust was placed in generated code only after source inspection and relevant checks. SQL generation required inspection and database execution; process exit status alone was insufficient. Browser rendering and interaction checks supplemented TypeScript/build checks. Independent human technical verification and human-labelled judge calibration have not been recorded.

## Boundaries retained

AI does not authorize prices, discounts, availability, delivery commitments, sending or trust promotion. Deterministic code owns money and policy; named reviewers authorize held replies. Production credentials, destructive production operations and final release decisions require accountable human ownership.

No synthetic label is presented as human calibration, no sample draft is presented as a model run, and no pending outbox record is presented as delivered, and simulator results are clearly labelled. Local receipt/queue processing and simulated dispatch are implemented. Production adapter authentication, real channel delivery/reconciliation, general model-written wording and measured evaluation/trust evidence remain unfinished.
