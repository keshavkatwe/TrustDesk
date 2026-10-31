# Reading the backend

Start with the service for the feature you are changing. It shows the business steps and where transactions begin. Open its helper files only when you need the details of a step.

## Boundaries

```text
HTTP request → Elysia feature controller → core service → tenant transaction
pg-boss job → worker                    → same core services
```

- `apps/api/src/modules/<feature>/index.ts`: extract HTTP inputs, call the service, map its result to an HTTP response. `model.ts` supplies Zod contracts. `apps/api/src/controller.ts` shares validation and exception handling.
- `packages/core/src/<feature>/service.ts`: authorize the allowed business, validate the input and coordinate the operation. Core has no Elysia context or HTTP status codes.
- Feature helpers have concrete responsibilities: queries, receipts, review, AI claim/completion, pricing rules. A feature gets only the files it needs.
- `packages/db`: connection, tenant transactions, schema, relations, migrations and source loading. Ordinary reads use Drizzle relational queries; explicit locks and mutations use the SQL builder.

## Where to start

| Task | Entry point | Details |
| --- | --- | --- |
| Receive a customer message | [receive/service.ts](../packages/core/src/receive/service.ts) | [receipts.ts](../packages/core/src/receive/receipts.ts) handles duplicates/conflicts; [messages.ts](../packages/core/src/receive/messages.ts) saves new messages and supersedes old drafts. |
| Generate a draft | [ai/service.ts](../packages/core/src/ai/service.ts) | [claim.ts](../packages/core/src/ai/claim.ts) reserves an attempt; [generate.ts](../packages/core/src/ai/generate.ts) validates provider output; [complete.ts](../packages/core/src/ai/complete.ts) checks freshness and saves the result. |
| Calculate prices and decide policy | [pricing/evaluate.ts](../packages/core/src/pricing/evaluate.ts) | [policy.ts](../packages/core/src/pricing/policy.ts) checks request/routing rules; [lines.ts](../packages/core/src/pricing/lines.ts) validates and prices products; [quote.ts](../packages/core/src/pricing/quote.ts) adds required fees and calculates discount/VAT. |
| Read or review the inbox | [inbox/service.ts](../packages/core/src/inbox/service.ts) | [queries.ts](../packages/core/src/inbox/queries.ts) builds the inbox view; [review.ts](../packages/core/src/inbox/review.ts) checks and records a named decision. |
| Simulate delivery | [dispatch/service.ts](../packages/core/src/dispatch/service.ts) | Read approval, lock the conversation, return any existing result, recheck current policy and record one delivery/cancellation. |
| Run background work | [queue/worker.ts](../packages/core/src/queue/worker.ts) | [process-job.ts](../packages/core/src/queue/process-job.ts) handles a drafting job; [recovery.ts](../packages/core/src/queue/recovery.ts) marks abandoned work failed. |
| Inspect operational evidence | [quality/service.ts](../packages/core/src/quality/service.ts), [activity/service.ts](../packages/core/src/activity/service.ts) | Quality queries keep originating output separate from failed regeneration. Activity has one named reader per source in [sources.ts](../packages/core/src/activity/sources.ts). |
| Edit business rules | [settings/service.ts](../packages/core/src/settings/service.ts) | [rules.ts](../packages/core/src/settings/rules.ts) converts, normalizes, validates and versions rules. The service saves rules and their audit entry together. |

## Follow one enquiry

1. Receive validates the event and resolves the receiving destination to an allowed business. Within one transaction, it checks for a repeated provider message. A new message reuses the conversation identified by business + channel + customer, saves a pending draft and queues drafting. A duplicate records another receipt without another job.
2. Drafting claims the current revision inside a transaction. It then calls the provider **outside the transaction**. Completion opens a new transaction and rechecks the revision, conversation and pricing before saving a new version.
3. Pricing applies request policy, prices product lines, adds mandatory fees and calculates totals. It then chooses the disposition and fingerprints the assessment. All arithmetic stays in bigint until safe output conversion. Its state belongs to one evaluation; helpers append reasons in execution order.
4. Review checks the named approver, current draft and submitted revision. Approval also recalculates policy and checks edited commercial facts. Draft status, review/edit history and approved outbox intent commit together.
5. The worker scans pending outbox work. Dispatch checks freshness and policy again, then records a simulated send or cancellation. Repeated dispatch returns the existing immutable result.

## Transactions and errors

The transaction is visible as `withTenant(database, tenantId, tx => ...)`. Helpers receive that same `tx`; they do not quietly start another transaction. The database helper sets tenant context for that transaction only, and every business query also carries an explicit tenant filter.

[inbox/locks.ts](../packages/core/src/inbox/locks.ts) owns the shared draft locking and freshness check. Always lock the conversation before the draft. Pricing holds a shared business-row lock through commit; settings take an exclusive lock. These checks prevent a correction, review or settings save from leaving stale work approved or applied.

Expected rejections return `failure(code, message)`, for example a stale revision or invalid approver. Callers check `result.ok` and use the code. Unexpected database failures throw so the transaction rolls back; the HTTP controller returns a generic unavailable response. Provider failures are saved as categories without private exception text.

The worker tracks its current maintenance promise. Shutdown stops polling and awaits that promise, without a loop that repeatedly checks a boolean.

## Patterns and dependencies

This follows [Elysia's feature/controller/service guidance](https://elysiajs.com/essential/best-practice) and [Drizzle's transaction model](https://orm.drizzle.team/docs/transactions). The code uses small functions, early returns and explicit dependencies. There is no generic repository or dependency-injection framework.

The existing packages are sufficient. `neverthrow` was considered for typed errors, but the existing discriminated results need only a shared `Failure` type and constructor. Keeping that shape avoids converting the workflow into a second error-handling API. No new runtime dependency was added.

Run `bun run check` for lint, types, unit/HTTP tests and builds; run `bun run db:test` against the isolated test database for transactions, RLS and races. `bun run api:generate` refreshes the OpenAPI/Hey API contract. Pure readability changes should preserve that contract, pricing engine version and assessment fingerprints.
