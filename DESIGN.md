# TrustDesk design

Status: working design, 29 October 2026. Only the boilerplate is implemented. Decisions marked **proposed** need implementation and measured evidence before they become claims about the system. Source: [Trust Desk Challenge v1.2](https://claude.ai/artifact/NvWejJ8j1TN8szJPnYJFFg#seed).

## Architecture and trust boundaries

Bun + Turborepo runs a Vite/React web app, Elysia API, and worker. PostgreSQL/Drizzle belongs in `packages/db`; shared backend services, including AI, belong in `packages/core`. Zod defines application schemas and inferred types. HTTP contracts use Elysia/Zod -> OpenAPI -> Hey API -> TanStack Query, with Zod's JSON Schema conversion registered in the OpenAPI plugin. LLM output will also use Zod and the official OpenAI SDK; model selection remains open until evaluated. UI uses stock shadcn defaults.

```text
Untrusted channel payload
  -> API: authenticate adapter, resolve receiving tenant
  -> Postgres transaction: receipt + unique message + queued work
  -> Worker: tenant-scoped catalogue/context -> one LLM draft
  -> UNTRUSTED model output -> schema/grounding/money/policy checks
  -> low-risk auto-send OR named-person approval OR hand-off/drop
  -> transactional outbox -> simulated dispatch + audit trail

Owner UI -> API -> tenant/revision checks -> core services -> Postgres
```

Tenant data crosses the model-provider boundary only in that tenant's request. Business-owned records, citations, logs, and views remain tenant-scoped. Receiving-channel identity is distinct from the hard-coded demo approver identity.

## Planned flow and data model

Resolve the tenant from an authenticated receiving-channel mapping; ignore tenant claims in customer metadata. Replay is an explicitly local synthetic adapter. Persist receipts separately from messages; a unique `(tenant_id, channel, message_id)` claims work atomically. Queue publication shares the transaction or uses a recoverable transactional outbox. Acknowledge after durability, before inference.

The worker supplies only the tenant's versioned catalogue, rules, and relevant conversation context to one structured drafting call. Code validates citations, quantities and units, recomputes money, and chooses `auto_send`, `needs_approval`, `hand_off`, or `drop`, with reasons. Track conversation revisions so a newer message supersedes an older pending draft. Approval and dispatch both recheck staleness.

Planned records: tenants/channel mappings/approvers; catalogue versions and rows; conversations/messages/event receipts; agent versions/draft revisions/policy results; approvals/edit diffs/outbox/audit events; gold-set versions/eval runs/results/trust events. Business-owned foreign keys include tenant identity. Approval uses a conditional state transition and a unique terminal decision; approval plus outbox intent is atomic. Outbox uniqueness prevents duplicate simulated dispatch. Production delivery would additionally need provider idempotency or reconciliation.

Use RLS with transaction-local tenant context and a restricted application role; migration privileges remain separate. Tests must exercise that role, including pooled-connection reuse. Durable failures stay visible and replayable.

## Tenant rules, money, and assumptions

| Tenant | Configured rules from the seed |
| --- | --- |
| Qamar | AED, 5% VAT, discount approval at >=10%, Dubai/Sharjah, low-risk auto-send enabled. Rentals >12 months escalate; delivery/setup is once per order. |
| Rimal | SAR, 15% VAT, discount approval at >=5%, Riyadh, auto-send off, minimum SAR 2,000 before VAT. Required crew for stage >12 m², screen >6 m², or any tent. |

Proposed assumptions: firm quotes, discounts, availability and delivery promises require approval; clarification and non-committing FAQ replies may be low-risk. Unknown products are clarified without silent substitution. Add delivery only when applicable and record the trip assumption. Apply the minimum order after discounts, before VAT. Do not invent a discount percentage from a request for a better price.

Store catalogue/final amounts in integer fils/halalas. Calculate fractional quantities, discounts and VAT with decimal arithmetic; round discount and invoice-level VAT half-up to two decimals, then sum the rounded components. Version this policy. Resolve relative dates against the message timestamp and tenant timezone. Preserve relevant context for customer corrections.

Reply in the customer's primary language; proposed fallback for genuine Arabizi is Arabic, and for balanced Arabic/English input is the tenant's preferred language. Normalize Arabic-Indic digits for extraction. Use RTL Arabic text with isolated LTR SKUs, amounts, and dates. Keep ambiguous language cases supervised and evaluate the language slices separately.

## Code, judge, and trust

Code owns schema/reference checks, tenant ownership, arithmetic, required fees, configured rules, state transitions and send eligibility. Render commercial amounts from computed facts; free-text claims that cannot be safely validated remain held. An LLM judge scores intent understanding, helpfulness/completeness, and language appropriateness, with rationales and `not_assessable`; it cannot override code.

Proposed trust threshold: zero hard-rule violations and >=95% assessed case passes per tenant/version, with coverage reported; unassessable results are not passes. Any hard violation or threshold failure demotes that officer/version to supervised. A named human alone promotes; new versions do not inherit promotion. False demotion costs review time; false promotion risks business commitments and disclosure, so uncertain results stay supervised. Rimal still requires approval when trust is autonomous.

Build >=30 tagged cases with expected properties across tenants, languages and failure categories. Human-label >=10 real outputs; report agreement, disagreements and rubric changes honestly. Pin agent, catalogue, case-set and judge versions. The regression command compares a candidate with the last accepted baseline on the same cases, blocks hard failures, threshold failures or category regressions, and stores the degraded candidate's demotion. A rejected candidate does not overwrite the accepted version. Store genuine baseline/degraded runs for the key-free UI.

Evals can be fooled by seed memorization, lexical language checks, incomplete commitment detection, judge self-agreement and aggregate scores hiding weak Arabic. Add unseen paraphrases, adversarial cases, sliced metrics and human samples; passing the finite suite is evidence, not proof of every possible reply.

## Five priority threats

| Threat | Planned control and evidence |
| --- | --- |
| Forged tenant identity | Verified destination mapping; `evt_0011` stays Rimal despite Qamar metadata. |
| Cross-tenant disclosure | Scoped queries/prompts/logs, composite keys, RLS, canaries and deliberate filter-break test; probe `evt_0010`. |
| Prompt injection | Untrusted customer/model boundaries, no tools, bounded schema, code policy and held unverified commitments; probe `evt_0006`. |
| Duplicate or stale execution | Unique message/outbox keys, transactional decisions and revision checks; concurrent replay, approval races, `evt_0003/0004`. |
| Incorrect commercial promises | Source-derived decimal calculations, mandatory fees, named approvals and controlled reply rendering; test budget/crew cases. |

## Depth, scale, and delivery

Proposed depth: **A, failure handling**, and **B, isolation**. A adds bounded backoff, circuit breaker, global/tenant kill switches, daily spend reservations and a one-third-failure chaos run. B adds canaries and database isolation evidence. Both deepen the core reliability requirements; a third module earns no extra credit.

At 200 tenants/50,000 messages a day, inspect inference concurrency, provider limits, tenant fairness and database/queue pool contention first. Bound each tenant's in-flight jobs and spend, separate worker capacity, index tenant/status/time access paths, and retain aggregate metrics while archiving large run payloads.

Current: workspace, health endpoint, stock UI, spec export/client generation, lint/typechecks/builds. Next stages: database/seeds; receive/queue/dedupe; draft/pricing/policy; approval/outbox/trails; evals/trust/depth. Keep a complete thin spine before optional depth. Cut live integrations, production auth/deployment and cosmetic work. Submission docs remain short: README, this design (target <=3 pages), handler review, AI log, six-week team plan, and an 8–12 minute walkthrough. No production-readiness or measured-quality claim is made yet.
