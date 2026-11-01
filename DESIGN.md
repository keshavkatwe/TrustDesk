# TrustDesk design

Source: [Trust Desk Challenge v1.2](https://claude.ai/artifact/NvWejJ8j1TN8szJPnYJFFg#seed). **Agents draft; code decides.** Status: 1 November 2026. The local five-stage spine is implemented. Human calibration is recorded only through actual human reviews; no machine-generated label counts as human evidence. Real channel delivery and production authentication are outside this submission.

## Architecture and data boundaries

Bun/Turborepo runs a Vite/React client, Elysia API and pg-boss worker. PostgreSQL/Drizzle lives in `packages/db`; plain business services live in `packages/core`. Zod supplies HTTP, configuration and model schemas. Elysia exports OpenAPI; Hey API generates the web client. UI uses the selected stock shadcn Mist/Teal/Inter preset. There is no agent framework or tool loop.

```text
Local enquiry / replay → trusted destination mapping
 → receipt + unique message + placeholder + queue job [one transaction]
 → claim → one structured OpenAI call [outside transaction]
 → code pricing / policy / controlled reply → versioned draft
 → named review + edit + outbox [one transaction]
 → current-message / policy / trust check → simulated delivery ledger

Versioned goldset → real extraction + code checks + structured judge
 → immutable run / accepted baseline → regression gate
 → human calibration → named promotion; failures record supervision
```

Seventeen domain tables force tenant RLS, including the migration owner. `withTenant` sets transaction-local context on a restricted pooled connection. Explicit filters and tenant-inclusive foreign keys provide additional protection. Ordinary reads use Drizzle relations; SQL remains for locks, mutations and predicate subqueries. Source bigint money stays in top-level reads to preserve precision. Runtime cannot modify published catalogue data, reviews, labels, trust history or delivery results. Settings can update only specifically granted rule columns and must append a named before/after audit atomically.

The loopback-only adapter resolves tenant from a configured channel/destination within the operator's allowed businesses. Customer metadata cannot authorize a tenant. Provider identity is tenant + channel + message ID; event receipts are separate. Intake atomically reserves a conversation sequence, stales earlier pending drafts and enqueues identifiers only. A queue failure rolls back the entire intake. Conversation-before-draft locking, revisions, latest-version checks and uniqueness guard retries, corrections and competing reviewers.

## Model and deterministic decisions

One bounded Responses API call extracts intent, language, products/variants, quantities, rental periods, location, requested date, budget and missing details. Dates are requests, never confirmed availability. Customer text and model output are untrusted. Only the current business catalogue/FAQ enters the prompt. Zod-derived Structured Outputs constrain the schema; post-validation rejects foreign SKUs and records invalid/refused/incomplete responses. Provider timeout is 45 seconds, output cap 3,000 tokens, retries zero. Interrupted attempts become visibly failed rather than silently repeating paid calls.

Code owns rates, fees, exact half-up line/discount/VAT arithmetic, currency, policy and sending. Qamar charges delivery once per order; Rimal adds required crew once and delivery per confirmed trip. Unknown details stay unresolved; catalogue and rule fingerprints are checked again before approval and dispatch. Free-text edits cannot change numbers/currency; a named reviewer remains responsible for semantic wording. Controlled English/Arabic templates keep commercial claims out of generated prose. This deliberately sacrifices rich model-written replies for a narrower auditable boundary.

Firm quotes, requested dates, availability and custom deals remain held. Automatic eligibility is limited to a verified English FAQ with no product, date, availability, discount or missing detail, enabled tenant configuration and current autonomous trust. Arabic FAQ replies remain held. A named promotion never enables Rimal's disabled setting. Automatic intents reference the draft and promotion event, not a fabricated human review. Both intent types recheck staleness and policy; automatic dispatch also holds the trust lock through ledger insertion. One result per outbox ID proves local simulator idempotence. External exactly-once delivery is not claimed.

## Proof, trust and the two depth choices

`evals/goldset.json` contains 32 versioned property-based cases across both tenants, both languages, mixed language/Arabizi and six categories. Cases check corrections, missing information, inclusive thresholds, unknown variants, injection and foreign-catalogue requests. Code checks SKU scope, language/script, required holds, reference totals, source rates and exact invoice arithmetic. A separate structured judge scores **intent fidelity, language and helpfulness**, each with rationale and `not_assessable`. It evaluates the final interpretation/assessment/reply together; it cannot authorize a send.

The gate requires zero hard failures, at least 95% passing cases overall and in the Arabic/mixed/Arabizi slice, and no previously passing case becoming a failure. Unassessable and failed judges are not passes. Suite, judge and business-configuration changes require an explicit new baseline; a failed candidate cannot replace an accepted one. Reports include prompt hash, model, parameters, schema/engine versions, context/suite hashes, response IDs, tokens, estimated cost and timing. Saved reports contain real provider outputs; mocks exist only inside automated tests. A key-free command recomputes the saved degraded-run gates.

Trust belongs to a tenant, agent identity and business configuration. A failed run records supervision for that version; a later failure for a promoted version revokes it. An unevaluated version inherits nothing. Promotion requires a named local reviewer, the latest accepted passing run, five independently labelled outputs for that tenant, at least 90% dimension agreement and no human failures/abstentions. Ten labels across the two businesses satisfy the challenge's minimum. Label and promotion history is append-only. This small sample is a demonstration, not statistical proof. False promotion can send unsuitable replies; false demotion costs manual work, so the policy prefers supervision. Human labels must be genuinely supplied; the app hides judge grades until a label is saved or independent review is explicitly skipped.

Exactly two depth areas are chosen: **B, isolation**, because cross-business disclosure breaks the product's central promise; and **D, Arabic quality**, because half the operating context depends on it. Restricted-role tests plant a private canary, trace its absence from another tenant’s prompt, saved output and UI payloads, omit/wrongly apply filters, collide IDs and reject foreign references. Deliberately mixed contexts fail before inference. Arabic coverage includes Gulf Arabic, MSA, Arabizi, Arabic digits, mixed language, RTL presentation and an independently gated slice. Early real runs exposed Arabizi classification and repetitive Arabic clarification errors; subsequent runs retain the evidence and corrected behavior. No additional depth module is claimed.

## Threats, limits and operating assumptions

| Threat | Control and residual limitation |
| --- | --- |
| Forged tenant / foreign data | Destination mapping, scoped prompts, forced RLS, composite keys and isolation tests. The local operator selector is not production authentication. |
| Injection / fabricated commercial claims | Untrusted message boundaries, strict output, no tools, source-only code pricing and held commitments. Semantic extraction can still be wrong. |
| Duplicate, stale or competing decisions | Unique provider identities, atomic enqueue, revisions, consistent locks, latest-message checks and one delivery result. Real providers require idempotency/reconciliation. |
| Wrong language / misleading edits | Arabic slice, deterministic templates, RTL/currency handling, judge and named review. Numeric edit checks do not prove semantic equivalence. |
| Misleading evaluation / unpriced spend | Frozen cases/versions, hard checks, judge rationales, independent labels, abstention failures and usage records. Same-family generator/judge errors can correlate; usage lost before persistence needs reconciliation. |

The judge can be fooled by plausible wording or untrusted evidence; a small curated set can overfit. Cases assert properties rather than exact prose, hard invariants never depend on judge approval, and independent labels expose disagreements. Expanding blind holdouts and using an independently calibrated judge are next evidence improvements. Settings changes invalidate context-bound trust rather than silently inheriting it.

At 200 tenants and 50,000 messages/day, add authenticated adapter/operator identities, tenant concurrency/spend reservations, provider reconciliation, retention and pool/queue load measurements before launch. Current operation assumes synthetic input, two configured businesses, one local worker and simulated delivery. No production load or security certification is claimed. The deadline cut is a complete local decision/proof trail, not real channel connectors, deployment polish, arbitrary request editing, tenant memory or routing experiments.
