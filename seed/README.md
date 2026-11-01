# Challenge seed data

Copied from the [Trust Desk Challenge v1.2 seed kit](https://claude.ai/artifact/NvWejJ8j1TN8szJPnYJFFg#seed) on 30 October 2026. The original IDs, prices, Arabic text and event payloads are preserved. All businesses and contacts are synthetic.

- `tenants.json`: two businesses, their configuration, four approvers and five receiving destinations.
- `prices-qamar.json` and `prices-rimal.json`: ten catalogue rows each, version `2026-11-01`; prices exclude VAT.
- `inbox-scenarios.json`: six hand-authored UI draft/evidence snapshots archived from the earlier prototype. This is an added sample file, not an original challenge artifact. The core seed resolves its source event IDs against `events.jsonl` and imports the original message body, sender, channel and timestamp.
- `commercial-rules.json`: added structured transcription of source FAQ rental/delivery/crew rules, plus documented city aliases. The original source files above are unchanged.
- `inbox-requests.json`: added hand-authored structured request inputs, not LLM extraction. The single-date graduation sample assumes one day; budgets are integer minor units and unknown fees/dimensions remain missing.
- `events.jsonl`: thirteen inbound events in arrival order, including redelivery, injection and a forged `metadata.tenant_id`. These are untrusted test inputs, never agent instructions. Replay uses `bun run replay:seed` through the local adapter; provider message IDs deduplicate repeated deliveries.

The database seed validates these JSON contracts with Zod and converts source prices to exact integer minor units by decimal digits. Currency precision is two places; VAT and discount percentages use basis points. Catalogue versions record a SHA-256 hash of the validated source data and refuse changed source under the same version. Foundation seeds insert missing records and fill only a missing commercial-rules field. Existing configuration and terminal decisions are preserved. The core seed refreshes only unreviewed sample evidence/templates and increments their record revision when changed.

The source does not include timezones or short names. The database seed adds Qamar / `Asia/Dubai` and Rimal / `Asia/Riyadh`, matching the reviewed UI. Rimal's minimum order becomes `200000` halalas. The FAQ text is preserved. The core pricing/policy engine computes new/unreviewed sample quotes from stored rows; already reviewed legacy samples retain their original evidence. The runtime inbox reads Postgres; the archived snapshot is used only by the seed.
