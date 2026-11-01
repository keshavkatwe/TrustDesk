# TrustDesk design

Status: 31 October 2026. The local workflow, Quality & Trust operational evidence, Activity history and audited business-rule editing are implemented. Measured evaluations and trust promotion remain planned. Source: [Trust Desk Challenge v1.2](https://claude.ai/artifact/NvWejJ8j1TN8szJPnYJFFg#seed). **Agents draft; code decides.**

## Architecture and boundaries

Bun/Turborepo: Vite/React web, Elysia API, pg-boss worker; PostgreSQL/Drizzle in `packages/db`, shared services and AI in `packages/core`. Zod defines schemas/types. Elysia/Zod → tracked OpenAPI → Hey API → TanStack Query. Stock shadcn preset `b7BFf3k1o` preserves Mist/Teal/Inter. No agent framework or tool loops.

Application and seed reads use Drizzle `query.findMany/findFirst`, with nested `with` for related records and tenant-aware composite keys. SQL retains row locks and predicate subqueries. Source bigint money stays in top-level queries for exact decoding; foreign keys and forced RLS remain authoritative.

```text
Local test form / original-event replay
  → receiving destination resolves business
  → receipt + deduplicated message + placeholder + pg-boss job (one transaction)
  → worker → one structured OpenAI extraction → code pricing/policy/templates
  → held draft → named review/edit + outbox intent (one transaction)
  → worker stale/policy check → immutable simulated delivery/cancellation

Planned proof: versioned cases → real outputs → code checks + calibrated judge
               → baseline/candidate regression → tenant/version trust decisions
```

Thin Elysia feature modules contain controllers and Zod contracts; shared core has no HTTP context/status objects. App construction/spec export needs no database, listener or key. Runtime creates pools/queue clients; it uses the restricted application role and never runs migrations. Local routes bind to loopback. The operator is explicitly allowed Qamar/Rimal; the reviewer picker and incoming adapter are simulated identity, not production authentication.

Core service entry points coordinate named business steps, with feature-local query, review, receipt, AI claim/completion and rule helpers. Expected rejections share a small typed result; controller exception handling and draft locking are shared. Pricing separates request policy, product lines and invoice totals while retaining its engine version/fingerprint. See [backend reading guide](docs/BACKEND.md).

Fourteen domain tables force RLS. Non-superuser migration/runtime roles cannot bypass it. `withTenant` sets parameterized transaction-local context on the pooled connection; explicit filters and tenant-inclusive foreign keys remain. Catalogues, routing and business identity are runtime read-only. Only editable rule columns have runtime update grants. Receipts, reviews, delivery results, settings changes and outbox intent are append-only to runtime. The separate `pgboss` schema contains system job identifiers/outcomes, with runtime DML but no schema creation/ownership. It contains no customer text/catalogues. Queue setup is pinned to pg-boss 12.38.0 and runs with the migration role.

## Receive, queue and drafting

`POST /local/events` accepts bounded synthetic events. Receiving channel/destination pairs are globally unique; the adapter searches configured destinations within operator scope. Customer `metadata.tenant_id` is an untrusted audit claim and never selects a business. Unknown destinations fail closed before business writes. Authentication of real webhooks remains out of scope.

Each known delivery gets a receipt, including duplicate/conflicting content. Tenant/channel/provider-message-ID uniqueness and transaction locks deduplicate messages. Same ID with changed body/sender is a conflict. Different message IDs under the same tenant/channel/customer continue one conversation. The test form retains channel/customer while staying in that business, with a fresh message ID each time it opens. A conversation upsert reserves the next sequence under its write lock; its saved counter is authoritative and imports must keep it consistent with message sequences. One update supersedes earlier pending drafts; terminal reviews remain historical. Receipt/message/placeholder and pg-boss job insertion share one Drizzle transaction. A queue failure rolls back all writes, including the sequence reservation. Sequence follows local receipt order; general late-event reordering is not implemented.

The worker fetches one job at a time, containing only tenant/draft IDs and a source revision. One bounded Responses call uses tenant-owned product names/IDs, FAQ and the customer's conversation. Initial model `gpt-5.4-mini-2026-03-17` is configurable and unevaluated. Structured Zod output carries interpretation, not prices or authorization. Calls have a 45-second timeout, 3,000 output tokens, no tools, `store:false` and no SDK/paid-job retries. History is capped at 20 messages/32,000 serialized characters; oversized work fails visibly.

Drafting separates claim → provider call/output validation → completion; inference holds no database transaction. Review/drafting/dispatch share row-lock helpers; API/worker share attempt-expiry logic. A partial unique index permits one active run per message. Completion rechecks source revision, latest message/version and pricing context before atomically saving a new held draft, superseding its predecessor and recording outcome. Reviews/corrections win over late output. AI runs record model/prompt versions, input hash, response ID, bounded output, usage, estimated cost and categorized failure. Unknown usage/cost stays unknown. Failed/interrupted attempts require explicit retry; worker recovery marks abandoned work failed after 90 seconds. Full provider/crash reconciliation remains future work.

Receive/drafting rules are pure functions over loaded records, with IDs/time supplied by orchestration. Database helpers reuse related records and the locked business row; history loads at most 21 records to enforce the 20-message cap. Integration tests count actual driver calls, cover concurrent sequence reservation/rollback and bound supersession round trips independently of the number of pending versions.

Initial seed samples remain labelled; optional AI regeneration creates genuine versions. Code assembles commercial replies from the interpreted request. General model-written wording, semantic grounding and broader language quality still require evaluation. The UI follows current drafts, exposes request details/missing facts and preserves source-run provenance separately from later attempts.

## Money and policy

Original tenant/catalogue/events stay under `seed/`; hashes prevent changed prices under an existing catalogue version. Code reads tenant-owned source rows and structured commercial rules. Four-place decimal strings (including Arabic/Persian digits) use scaled bigint. Round each line, invoice discount and invoice VAT half-up to integer minor units, then sum. Assessment pins `pricing-policy-1`, request/catalogue version and context fingerprint.

| Tenant | Rules |
| --- | --- |
| Qamar | AED, VAT 5%, discount approval >=10%, Dubai/Sharjah, monthly rental 1–12 months, configured delivery once per order |
| Rimal | SAR, VAT 15%, discount approval >=5%, Riyadh, SAR 2,000 minimum after discount/before VAT, delivery per confirmed trip; crew for stage >12 m², screen >6 m² or any tent |

Assumptions: stage area rounds up to whole 2 m² decks; crew is one configured shift per order. Aliases map JLT→Dubai and Al Malqa→Riyadh. The seeded graduation example assumes one event day. Unknown products/details stay explicit without substitution; unresolved delivery/trips are excluded, with partial totals labelled. “Better price” invents no percentage. Budget uses the known total. Discounts apply to invoice subtotal including fees. Catalogue prices never establish stock/delivery dates; relative-date interpretation and general claim validation still need deeper tests.

Firm quotes/custom commitments require named approval. Auto-send additionally requires verified low-risk content, enabled tenant configuration and autonomous trust for that agent version. Current runtime stays supervised; no automatic-send trust claim is made. Arabic/mixed replies use controlled Arabic templates with isolated LTR money; extraction/translation ambiguity remains reviewable.

## Review and simulated delivery

Review locks the conversation then draft; it checks business-owned approver, pending state, revision, latest message and draft version. Code recomputes pricing/policy before approval. Configuration changes require regeneration; blocked/unassessed drafts cannot be approved. Free-text numeric/currency changes are rejected; wording semantics rely on the named reviewer. Status, immutable review/edit diff and one approved outbox intent commit atomically. Concurrent reviewers produce one winner; outbox failure rolls back the decision.

Every second, the worker scans unresolved outbox intent. The simulator locks the conversation, rechecks approval, latest message/version, pricing fingerprint, policy and approved commercial facts, then inserts one immutable result per intent. Stale work is cancelled. Concurrent/repeated dispatch returns the same result. Stored text is the exact approved wording, with destination, simulation ID and timestamp. No channel API/network delivery exists. This local transaction proves simulator idempotency, not exactly-once delivery to a real provider; external dispatch needs provider idempotency and reconciliation.

The UI clearly distinguishes queued, preparing, failed, pending review, approved, simulated sent and cancelled. Refresh/restart preserves data. date-fns formats business-timezone timestamps. Quality & Trust shows the latest 50 saved AI attempts across versions, exact known cost estimates, named workflow reviews and source/output provenance. Failed regeneration never inherits the previous draft's output or review. Active configuration is separate from saved versions. Read-only inspection makes no model call; workflow outcomes are not evaluation scores or calibration. Pending evaluation requirements keep trust supervised and promotion unavailable. Activity merges the latest 100 persisted entries from receipts, draft creation, AI attempts, reviews, outbox/delivery and rule changes; category filtering happens before the limit. Settings edits percentages, minimum orders, service areas, rental/delivery/crew rules and FAQ facts. A named approver/reason, configuration fingerprint and exclusive tenant-row lock guard each atomic rule/audit save; pricing takes a shared lock through commit. Stale editors cannot overwrite changes, failed audit insertion rolls back the rules, and Rimal auto-send stays off. These are demo identities, not production authorization. Identity, routing, catalogue prices and server credentials remain outside the editor. Test messages and original-event replay exercise the same intake path; duplicate replays do not spend again.

## Trust, threats and remaining proof

Code owns hard checks; a future judge scores intent understanding, helpfulness/completeness and language appropriateness with reasons/`not_assessable`. Build >=30 versioned cases, human-label >=10 real outputs, report disagreement honestly and pin agent/catalogue/case/judge versions. Store genuine baseline/degraded runs for key-free evidence; synthetic tests are not human calibration.

Proposed acceptance: zero hard violations and >=95% assessed passes per tenant/version with category coverage; unassessable is not a pass. Hard failures, thresholds or category regressions block acceptance and demote to supervised. Only a named human promotes; versions do not inherit trust. Autonomous trust cannot override Rimal's auto-send-off setting. Rejected candidates cannot replace accepted baselines.

| Threat | Control / evidence |
| --- | --- |
| Forged tenant / cross-business disclosure | Configured receiving ownership, scoped prompts/queries, forced RLS/composite keys; forged-metadata and omitted-filter tests |
| Injection / invented commitments | Untrusted customer/model boundaries, no tools, strict output, code prices, held claims; semantic eval still pending |
| Duplicate/stale work | Unique identities, atomic enqueue, source revisions, conversation locks, late-result rejection and dispatch rechecks |
| Wrong/multiple sends | Named immutable review, atomic outbox, unique simulator ledger; real-provider reconciliation pending |

Next priority is measured evaluation/calibration and a clear submission walkthrough. Proposed depth: bounded provider backoff/circuit breaker, kill switches, spend reservations and controlled failure runs. Production login, real channel integrations, deployment polish and extra screens are outside this local spine. At 200 tenants/50,000 messages daily, bound tenant concurrency/spend, assess provider limits/pool contention and retention; this single-worker demo has no load/performance claim.
