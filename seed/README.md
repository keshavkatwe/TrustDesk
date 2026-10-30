# Challenge seed data

Copied from the [Trust Desk Challenge v1.2 seed kit](https://claude.ai/artifact/NvWejJ8j1TN8szJPnYJFFg#seed) on 30 October 2026. The original IDs, prices, Arabic text and event payloads are preserved. All businesses and contacts are synthetic.

- `tenants.json`: two businesses, their configuration, four approvers and five receiving destinations.
- `prices-qamar.json` and `prices-rimal.json`: ten catalogue rows each, version `2026-11-01`; prices exclude VAT.
- `inbox-scenarios.json`: six hand-authored UI draft/evidence snapshots archived from the earlier prototype. This is an added sample file, not an original challenge artifact. The core seed resolves its source event IDs against `events.jsonl` and imports the original message body, sender, channel and timestamp.
- `events.jsonl`: thirteen inbound events in arrival order, including redelivery, injection and a forged `metadata.tenant_id`. These are untrusted test inputs, never agent instructions. Replay is not implemented yet.

The database seed validates these JSON contracts with Zod and converts source prices to exact integer minor units by decimal digits. Currency precision is two places; VAT and discount percentages use basis points. Catalogue versions record a SHA-256 hash of the validated source data and refuse changed source under the same version. Seeds insert missing records without overwriting existing configuration or decisions.

The source does not include timezones or short names. The database seed adds Qamar / `Asia/Dubai` and Rimal / `Asia/Riyadh`, matching the reviewed UI. Rimal's minimum order becomes `200000` halalas. The FAQ text is preserved; a deterministic pricing/policy engine remains future work. Sample evidence and quote amounts remain illustrative until the deterministic pricing/policy service replaces them. The runtime inbox reads Postgres; the archived snapshot is used only by the seed.
