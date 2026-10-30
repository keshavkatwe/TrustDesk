# TrustDesk design

Status: 30 October 2026. A durable inbox and approval flow work with sample drafts. Inference, pricing/policy, replay/queue, dispatch and evaluations remain planned. Source: [Trust Desk Challenge v1.2](https://claude.ai/artifact/NvWejJ8j1TN8szJPnYJFFg#seed). **Agents draft; code decides.**

## Architecture and boundaries

Bun/Turborepo: Vite/React web, Elysia API, worker; PostgreSQL/Drizzle in `packages/db`, shared backend services and future AI in `packages/core`. Zod defines schemas and inferred types. Elysia/Zod -> tracked OpenAPI -> Hey API -> TanStack Query. One structured OpenAI drafting call per message is planned; model selection remains open until evaluated. No agent framework or tool loops. Stock shadcn uses the approved Mist/Teal/Inter preset `b7BFf3k1o`.

```text
Implemented: Web -> Elysia inbox controller -> core service -> tenant-scoped Postgres
             named review + edit + pending outbox intent share one transaction

Planned:     untrusted event -> verify receiving tenant -> durable receipt/message/job
             -> worker/tenant context -> untrusted LLM draft -> code checks
             -> low-risk auto-send OR named review OR handoff/drop
             -> outbox -> stale check -> simulated dispatch + audit
```

Elysia feature modules contain `index.ts` controllers and `model.ts` contracts; inbox contracts are shared core Zod schemas. Handlers extract inputs and map outcome codes to HTTP statuses. Core has no HTTP context/status objects. Process startup creates the application pool; constructing/exporting the app requires no database, listening socket or model key. Unconfigured/unavailable inboxes fail with a generic 503, without database details or an in-memory fallback.

All ten business tables force RLS. Non-superuser migration and runtime roles cannot bypass it; catalogues/configuration are runtime read-only. Parameterized `withTenant` sets transaction-local context on the pooled connection. Explicit filters and tenant-inclusive foreign keys remain. Tests exercise missing/wrong filters, cross-tenant references, rollback and pooled/concurrent context isolation. Receiving channel/destination pairs are globally unique. Original source data stays in `seed/`; catalogue hashes prevent changed prices under an existing version.

## Implemented inbox and review

Tables: tenants, approvers, receiving channels, catalogue versions/rows, conversations, messages, drafts, reviews, outbox. Messages deduplicate by tenant/channel/provider message ID; conversations have ordered message sequences. Drafts keep message/version identity, sample evidence, original wording and a separate record revision. One terminal review per draft stores the approver ID/name snapshot, original/edited wording, Unicode code point diff, reason and timestamp. One pending outbox entry references an approved review; database constraints reject intents for rejection/handoff.

Review locks the conversation then draft, checks the tenant's named approver, pending state, record revision, latest message sequence and latest draft version. It conditionally advances the state and saves review/edit/outbox atomically. Concurrent app pools produce one winner. A forced outbox failure rolls back all three changes. Future ingestion/draft creation must use the same conversation lock before advancing sequences/versions. Dispatch still needs its own stale check and idempotency/reconciliation strategy.

Six hand-authored drafts/evidence snapshots cover both tenants, Arabic/mixed language, corrected quantities, discounts, outside-area handoff, crew and budget overrun. The seed now imports exact original message bodies/senders/timestamps and validates receiving ownership. Draft extraction, reasons and quote arithmetic remain illustrative, not model or policy-engine output. Reseeding preserves decisions. Real application-process restart preserves a browser-approved Arabic edit and its outbox ID.

The local operator is explicitly allowed Qamar/Rimal; the approver picker is simulated identity, not production authentication. Edits are not commercially revalidated yet. Pending outbox means **not sent**; there is no dispatch consumer. These limits stay visible beside evidence and in README. No measured AI-quality or production-readiness claim is made.

Web: reusable `components`, smart `widgets`, route `pages`, `hooks`, non-React `libs`, generated-contract `types`. `/businesses/:tenantId/inbox` uses a shared layout; `/` opens the first allowed business. URLs do not authorize data access. Business switching resets reviewer, filters, selection and unsaved edits. date-fns/`@date-fns/tz` formats original instants in the business timezone. Added short names/timezones are documented assumptions. Quality & Trust, Activity and Settings stay disabled. The user's removed banners/status blocks remain removed; sample provenance stays beside drafts/quotes.

## Planned receive, money and policy

Authenticate the adapter and resolve tenant from its receiving destination; ignore customer `metadata.tenant_id`. Local replay is synthetic, not production authentication. Persist each event receipt separately from deduplicated messages. Claim work atomically; publish the job transactionally or through a recoverable outbox. Acknowledge durability before inference. Worker prompts/logs/context contain only the resolved tenant's data.

The worker supplies versioned catalogue, rules and conversation context to one structured drafting call. Code validates references, quantities/units and grounding, recomputes money and chooses `auto_send`, `needs_approval`, `hand_off` or `drop` with reasons. Models cannot authorize prices, discounts, availability, delivery, sends or promotion. Render commercial values from computed facts; hold claims that cannot be validated.

| Tenant | Source rules |
| --- | --- |
| Qamar | AED; VAT 5%; discount approval >=10%; Dubai/Sharjah; low-risk auto-send enabled; rental >12 months escalates; delivery/setup once per order |
| Rimal | SAR; VAT 15%; discount approval >=5%; Riyadh; auto-send off; SAR 2,000 minimum before VAT; crew for stage >12 m², screen >6 m² or any tent |

Proposed assumptions: firm commitments need named approval; non-committing clarification/FAQ may be low-risk. Unknown products need clarification, without substitution. Apply minimum after discounts/before VAT; do not invent a discount from “better price.” Confirm delivery trips rather than silently assuming. Exact decimal calculations produce integer minor units; round discount and invoice VAT half-up to two decimals, then sum. Version rounding policy. Resolve relative dates against message timestamp/business timezone.

Normalize Arabic-Indic digits for extraction. Reply in the customer's primary language; proposed Arabizi fallback is Arabic, balanced bilingual fallback the tenant preference. Isolate LTR SKUs/money/dates inside RTL text. Evaluate ambiguous language slices separately.

## Planned evidence, trust and threats

Code owns hard checks and send eligibility. A judge scores three dimensions—intent understanding, helpfulness/completeness, language appropriateness—with reasons and `not_assessable`; it cannot override code. Build >=30 versioned cases, human-label >=10 real outputs, report agreement/disagreements honestly, and pin agent/catalogue/case/judge versions. Store genuine baseline/degraded runs for a key-free demo; no synthetic labels masquerade as calibration.

Proposed bar: zero hard violations and >=95% assessed passes per tenant/agent version, with coverage; unassessable is not a pass. Hard failures, threshold failures or category regressions block acceptance and demote that version to supervised. A named human alone promotes; versions do not inherit promotion. Auto-send additionally requires low-risk output and tenant configuration, so autonomous trust cannot override Rimal's setting. Rejected candidates cannot overwrite accepted baselines. Seed memorization, weak commitment checks, judge self-agreement and aggregate scores hiding weak Arabic require unseen paraphrases, adversarial slices and human review.

| Threat | Planned control / evidence |
| --- | --- |
| Forged identity | Verified destination, not metadata (`evt_0011`) |
| Cross-tenant disclosure | Scoped queries/prompts/logs, composite keys, forced RLS, canaries, deliberate filter-break (`evt_0010`); database portion implemented |
| Injection | Untrusted customer/model boundaries, no tools, bounded schema, held unverified claims (`evt_0006`) |
| Duplicate/stale work | Unique keys, transactions, revisions, approval/dispatch checks (`evt_0003/0004`); review races/constraints implemented |
| Wrong commitments | Source-derived money, mandatory fees, controlled wording, named approvals; pricing engine pending |

## Delivery priority

The deadline is 30 October, extendable to 31 October. Prioritize demonstrable value: durable review is complete for sample drafts; next build receive/dedupe, deterministic pricing/policy and one drafting step, followed by simulated dispatch and measured eval/trust evidence. Complete a thin spine before optional depth or extra screens. Keep the working sample flow runnable without a provider key.

Proposed depth A: bounded backoff/circuit breaker, kill switches, daily spend reservations and a one-third-failure chaos run. Depth B: canaries and deeper isolation evidence. Cut live integrations, production login/deployment, cosmetic work and a third depth module. At 200 tenants/50,000 messages daily, bound tenant concurrency/spend, inspect provider limits and pool/queue contention, then archive large payloads while retaining metrics.

Submission: concise README/design, handler review, actual AI log, six-week team plan and an 8–12 minute walkthrough. `REVIEW.md` and `TEAM-PLAN.md` remain unwritten. Prioritize verifiable coverage and explicit omissions over claiming the entire challenge is complete.
