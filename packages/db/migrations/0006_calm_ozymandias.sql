CREATE TABLE "deliveries" (
	"tenant_id" text NOT NULL,
	"outbox_id" text NOT NULL,
	"status" text NOT NULL,
	"reason" text NOT NULL,
	"simulated_message_id" text,
	"reply" text NOT NULL,
	"destination" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_tenant_id_outbox_id_pk" PRIMARY KEY("tenant_id","outbox_id"),
	CONSTRAINT "deliveries_status" CHECK (("deliveries"."status" = 'simulated_sent' and "deliveries"."simulated_message_id" is not null) or ("deliveries"."status" = 'cancelled' and "deliveries"."simulated_message_id" is null))
);
--> statement-breakpoint
ALTER TABLE "deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_receipts" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"event_id" text NOT NULL,
	"message_id" text NOT NULL,
	"outcome" text NOT NULL,
	"body_hash" text NOT NULL,
	"claimed_tenant" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_receipts_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "event_receipts_outcome" CHECK ("event_receipts"."outcome" in ('accepted','duplicate','conflict')),
	CONSTRAINT "event_receipts_hash" CHECK ("event_receipts"."body_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "event_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drafts" DROP CONSTRAINT "drafts_provenance";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "processing_state" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tenant_id_outbox_id_outbox_tenant_id_id_fk" FOREIGN KEY ("tenant_id","outbox_id") REFERENCES "public"."outbox"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_receipts" ADD CONSTRAINT "event_receipts_tenant_id_message_id_messages_tenant_id_id_fk" FOREIGN KEY ("tenant_id","message_id") REFERENCES "public"."messages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_receipts_message_idx" ON "event_receipts" USING btree ("tenant_id","message_id");--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_provenance" CHECK ("drafts"."provenance" in ('sample', 'openai', 'received'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_processing" CHECK ("messages"."processing_state" in ('queued','processing','ready','failed','superseded'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "deliveries" AS PERMISSIVE FOR ALL TO public USING ("deliveries"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("deliveries"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "event_receipts" AS PERMISSIVE FOR ALL TO public USING ("event_receipts"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("event_receipts"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));
--> statement-breakpoint
ALTER TABLE event_receipts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE deliveries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON event_receipts, deliveries TO trustdesk_app;
--> statement-breakpoint
GRANT INSERT ON conversations, messages TO trustdesk_app;
--> statement-breakpoint
GRANT UPDATE (processing_state) ON messages TO trustdesk_app;
