ALTER TABLE "outbox" DROP CONSTRAINT "outbox_approval_only";--> statement-breakpoint
ALTER TABLE "outbox" ALTER COLUMN "review_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "draft_id" text;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN "trust_event_id" text;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_tenant_id_draft_id_drafts_tenant_id_id_fk" FOREIGN KEY ("tenant_id","draft_id") REFERENCES "public"."drafts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_tenant_id_trust_event_id_trust_events_tenant_id_id_fk" FOREIGN KEY ("tenant_id","trust_event_id") REFERENCES "public"."trust_events"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_one_automatic_intent_key" UNIQUE("tenant_id","draft_id");--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_approval_only" CHECK ("outbox"."status" = 'pending' and (
      ("outbox"."action" = 'approve' and "outbox"."review_id" is not null and "outbox"."draft_id" is null and "outbox"."trust_event_id" is null)
      or ("outbox"."action" = 'auto_send' and "outbox"."review_id" is null and "outbox"."draft_id" is not null and "outbox"."trust_event_id" is not null)));