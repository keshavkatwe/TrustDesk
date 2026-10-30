CREATE TABLE "conversations" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"channel" text NOT NULL,
	"customer" text NOT NULL,
	"latest_sequence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "conversations_customer_key" UNIQUE("tenant_id","channel","customer"),
	CONSTRAINT "conversations_channel" CHECK ("conversations"."channel" in ('whatsapp', 'email', 'webform')),
	CONSTRAINT "conversations_sequence" CHECK ("conversations"."latest_sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drafts" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"message_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"original_reply" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"provenance" text DEFAULT 'sample' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "drafts_message_version_key" UNIQUE("tenant_id","message_id","version"),
	CONSTRAINT "drafts_status" CHECK ("drafts"."status" in ('needs_approval','approved','rejected','handed_off','superseded')),
	CONSTRAINT "drafts_revision" CHECK ("drafts"."version" > 0 and "drafts"."revision" > 0),
	CONSTRAINT "drafts_sample" CHECK ("drafts"."provenance" = 'sample')
);
--> statement-breakpoint
ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"channel" text NOT NULL,
	"channel_message_id" text NOT NULL,
	"source_event" text NOT NULL,
	"body" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "messages_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "messages_delivery_key" UNIQUE("tenant_id","channel","channel_message_id"),
	CONSTRAINT "messages_conversation_sequence_key" UNIQUE("tenant_id","conversation_id","sequence"),
	CONSTRAINT "messages_channel" CHECK ("messages"."channel" in ('whatsapp', 'email', 'webform')),
	CONSTRAINT "messages_sequence" CHECK ("messages"."sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outbox" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"review_id" text NOT NULL,
	"action" text DEFAULT 'approve' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "outbox_one_intent_key" UNIQUE("tenant_id","review_id"),
	CONSTRAINT "outbox_approval_only" CHECK ("outbox"."action" = 'approve' and "outbox"."status" = 'pending')
);
--> statement-breakpoint
ALTER TABLE "outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reviews" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"draft_id" text NOT NULL,
	"draft_revision" integer NOT NULL,
	"approver_id" text NOT NULL,
	"approver_name" text NOT NULL,
	"action" text NOT NULL,
	"original_reply" text NOT NULL,
	"reply" text NOT NULL,
	"reason" text NOT NULL,
	"edit_diff" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "reviews_one_decision_key" UNIQUE("tenant_id","draft_id"),
	CONSTRAINT "reviews_approved_reference_key" UNIQUE("tenant_id","id","action"),
	CONSTRAINT "reviews_input" CHECK ("reviews"."draft_revision" > 0 and length(btrim("reviews"."reply")) between 1 and 4000 and length("reviews"."reason") <= 1000),
	CONSTRAINT "reviews_action" CHECK ("reviews"."action" in ('approve','reject','hand_off') and ("reviews"."action" = 'approve' or length(btrim("reviews"."reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_tenant_id_message_id_messages_tenant_id_id_fk" FOREIGN KEY ("tenant_id","message_id") REFERENCES "public"."messages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_conversation_id_conversations_tenant_id_id_fk" FOREIGN KEY ("tenant_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_tenant_id_review_id_action_reviews_tenant_id_id_action_fk" FOREIGN KEY ("tenant_id","review_id","action") REFERENCES "public"."reviews"("tenant_id","id","action") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_draft_id_drafts_tenant_id_id_fk" FOREIGN KEY ("tenant_id","draft_id") REFERENCES "public"."drafts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_approver_id_approvers_tenant_id_id_fk" FOREIGN KEY ("tenant_id","approver_id") REFERENCES "public"."approvers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_inbox_idx" ON "drafts" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "reviews_approver_idx" ON "reviews" USING btree ("tenant_id","approver_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "conversations" AS PERMISSIVE FOR ALL TO public USING ("conversations"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("conversations"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "drafts" AS PERMISSIVE FOR ALL TO public USING ("drafts"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("drafts"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "messages" AS PERMISSIVE FOR ALL TO public USING ("messages"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("messages"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "outbox" AS PERMISSIVE FOR ALL TO public USING ("outbox"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("outbox"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "reviews" AS PERMISSIVE FOR ALL TO public USING ("reviews"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("reviews"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));