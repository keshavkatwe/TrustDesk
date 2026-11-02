# TrustDesk

A local sales-review workspace for the Trust Desk challenge. Receive a synthetic enquiry, extract its request with OpenAI, calculate prices and policy in code, review the proposed reply, then record simulated delivery. Quality & Trust proves behavior with stored real evaluations, human labels and a regression gate.

**Agents draft. Code decides. People approve commitments.**

[Recorded walkthrough (Loom)](https://www.loom.com/share/87623409be894da1a585f99359db95ac)

## Start in five commands

Requires Bun **1.3.14** and Docker Compose. From the repository root:

```sh
bun install --frozen-lockfile
bun run db:up
bun run db:migrate
bun run db:seed
bun run dev
```

Open [the app](http://localhost:5173), [API health](http://localhost:3000/healthz), or [OpenAPI](http://localhost:3000/openapi).

No model key is needed to inspect the seeded inbox, stored evaluation outputs, judge rationales, blocked candidates, Activity or Settings. Seed imports real saved evaluation reports without calling a model. Repeating it preserves terminal decisions and human evidence; it may refresh unreviewed sample drafts. Local database defaults are in code and [.env.example](.env.example); the root `.env` is ignored.

For new AI-generated enquiries or fresh evaluations, put `OPENAI_API_KEY` in the local root `.env`. Never paste it into chat, commit it, or prefix it with `VITE_`. API/worker use the pinned `gpt-5.4-mini-2026-03-17`, configurable by `OPENAI_MODEL`; the priced evaluation runner deliberately requires the pinned model until new pricing is reviewed. Draft extraction uses strict Zod-derived Structured Outputs, medium reasoning, a 45-second timeout, 3,000-output-token cap and no SDK retries. The separate judge uses medium reasoning and a 3,000-token cap. Unknown/unavailable usage stays unknown.

## Try the workflow

1. Select Qamar or Rimal. Click **Test enquiry**, enter synthetic details and submit. Use [copy-and-paste enquiries](docs/TEST-ENQUIRIES.md) for original challenge cases.
2. Watch **Queued → Preparing → Needs approval**. Inspect the original conversation, extracted request/date, catalogue rows, exact VAT/total, missing details and policy reasons.
3. Choose a named demo reviewer, edit wording if needed, and approve. Changing commercial numbers/currency through free text is rejected. Competing decisions have one winner.
4. Watch **Sent · simulated** and open Activity for the receipt, draft, attempt, review, outbox and persistent simulation ID. No real WhatsApp/email message is sent.
5. Submit a follow-up with the same business/channel/customer. It continues the conversation and supersedes earlier pending drafts. An approved reply waiting to send is cancelled if a correction or changed policy makes it stale.

Six initial scenarios are explicitly hand-authored samples, not model/evaluation evidence. Explicit regeneration creates a new model-backed draft without overwriting terminal reviews. The worker does not automatically retry a failed paid call; the UI offers an explicit retry/handoff.

Replay original events through the same receiving adapter:

```sh
bun run replay:seed
```

Run it twice concurrently to inspect separate receipts but one message/job per tenant/channel/provider message ID. Already seeded provider identities are duplicates and do not spend again. Replay never resets data. Receiving destination wins over customer `metadata.tenant_id`; unknown destinations fail closed. This loopback adapter is a synthetic harness, not production webhook authentication.

## Evaluate and calibrate

Open **Quality & Trust**. Choose a stored run to inspect its real output, hard checks, three judge dimensions, Arabic slice, response IDs and gate result. Operational draft approvals are separate from evaluation labels.

- **Goldset:** 32 versioned cases, two businesses, six categories, English/Arabic/mixed/Arabizi. Expectations are properties, not exact wording.
- **Gate:** zero hard failures, at least 95% overall and Arabic-slice passes, and no previously passing case regressing. Judge abstention/failure is not a pass. A failed candidate cannot replace an accepted baseline.
- **Human calibration:** choose an accepted baseline marked **Current configuration**, inspect an output, grade intent fidelity/language/helpfulness and save your reasoning before revealing the judge. The app requires five genuinely human-labelled outputs per business, at least 90% dimension agreement and no human failures/abstentions before named promotion. Labels are immutable; disagreements remain visible.
- **Trust:** scoped to tenant + prompt/model/parameters/schema/engine identity + business configuration. Versions inherit no promotion. Failures supervise the evaluated version; only a named local reviewer can promote the latest current accepted run. The selector is a demo identity boundary, not authentication.

```sh
bun run eval:verify                 # key-free: recompute stored degraded gates
bun run eval:gate                   # paid: fresh real outputs + judge, compare accepted baseline
bun run eval:gate --accept          # accept only if the fresh run passes
bun run eval:gate --degraded        # real deliberately worse prompt; expected exit 1
bun run eval:export                 # export actual saved human labels/trust history
```

The live runner evaluates four independent cases at a time and stops at a $2 known-estimate ceiling; calls already in flight may finish. It retains partial evidence after each paid case. Reports under `evals/runs/` include earlier failures, accepted runs and degraded candidates. Failed calls without usage can remain unpriced; this is a bounded local runner, not a production spend-reservation system. `--tenant=qamar` or `--tenant=rimal` limits a run. When reviewed cases, judge or business rules change, use `--accept --new-baseline` explicitly; hard/pass-rate checks still apply and the prior baseline reference is retained.

Human labels are never generated by the runner. Export after the required real reviews so a clean key-free clone can show calibration. [Evaluation notes](evals/README.md) distinguish measured runs, iterative fixes and human evidence.

Automatic sending is intentionally narrow: a configured, verified **English FAQ** with no product, date, availability, discount or missing detail can create an automatic outbox intent only after current-version promotion and tenant enablement. It references the promotion event rather than inventing a human draft approval. Dispatch rechecks trust under a lock; revocation cancels pending work. Firm quotes stay held; Arabic FAQs stay held; Rimal auto-send remains off. All deliveries are simulated.

## Activity and Settings

Activity filters the latest persisted receipts, drafts, attempts, reviews, outbox results and rule changes. Settings permits named, audited edits of VAT, thresholds, service areas, rental/delivery/crew rules and FAQ facts. Stale editors cannot overwrite changes. Changed rules invalidate context-bound trust and require affected drafts to be regenerated. Catalogue prices, routing, identities and credentials remain outside this editor.

## Structure and verification

```text
apps/api       Elysia feature controllers, Zod, tracked OpenAPI
apps/web       Vite/React; components, widgets, pages, hooks, libs; stock shadcn
apps/worker    pg-boss consumer, recovery and simulated dispatch
packages/db    Drizzle schema/migrations, restricted roles, forced tenant RLS
packages/core  Receive, AI, exact pricing/policy, review, dispatch, evaluations/trust
scripts        Replay, real evaluation gate, saved-gate verification and human export
```

React Router keeps business pages under `/businesses/:tenantId`; TanStack Query uses generated Hey API calls. date-fns formats business timezones; Arabic/mixed text preserves RTL and currency direction. API construction/spec export never needs a live database or key. Generated SDK files are ignored; regenerate with `bun run api:generate` after route changes.

```sh
bun run check       # lint, types, unit/HTTP tests and builds; no database/key
bun run db:test     # real Postgres, separate *_test database and restricted roles
bun run eval:verify # saved real baseline/degraded evidence; no database/key
bun run db:studio   # Drizzle Studio, using root .env database configuration
```

Automated tests mock inference only inside test code; stored measured evidence uses real provider calls. The local simulator proves database idempotence, not exactly-once delivery to an external provider.

Read [DESIGN](DESIGN.md) for tradeoffs/threats and exactly two depth choices (isolation and Arabic), [REVIEW](REVIEW.md) for the supplied bad handler, [TEAM-PLAN](TEAM-PLAN.md) for six weeks with two engineers, and [AI-LOG](AI-LOG.md) for concise AI usage/error evidence. The human-recorded Loom is linked above. [AGENTS](AGENTS.md), [backend guide](docs/BACKEND.md), [database guide](packages/db/README.md) and [skill sources](docs/SKILLS.md) describe maintenance boundaries. Production authentication, real channel sending/reconciliation and load certification remain outside the implemented local demo.
