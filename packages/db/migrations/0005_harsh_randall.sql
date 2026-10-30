CREATE TABLE "ai_runs" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"message_id" text NOT NULL,
	"source_draft_id" text NOT NULL,
	"source_revision" integer NOT NULL,
	"result_draft_id" text,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"response_id" text,
	"output" jsonb,
	"usage" jsonb,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_runs_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "ai_runs_status" CHECK ("ai_runs"."status" in ('running','succeeded','failed','superseded')),
	CONSTRAINT "ai_runs_revision" CHECK ("ai_runs"."source_revision" > 0),
	CONSTRAINT "ai_runs_hash" CHECK ("ai_runs"."input_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "ai_runs_completion" CHECK (("ai_runs"."status" = 'running' and "ai_runs"."finished_at" is null) or ("ai_runs"."status" <> 'running' and "ai_runs"."finished_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drafts" DROP CONSTRAINT "drafts_sample";--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tenant_id_message_id_messages_tenant_id_id_fk" FOREIGN KEY ("tenant_id","message_id") REFERENCES "public"."messages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tenant_id_source_draft_id_drafts_tenant_id_id_fk" FOREIGN KEY ("tenant_id","source_draft_id") REFERENCES "public"."drafts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tenant_id_result_draft_id_drafts_tenant_id_id_fk" FOREIGN KEY ("tenant_id","result_draft_id") REFERENCES "public"."drafts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_runs_active_message_key" ON "ai_runs" USING btree ("tenant_id","message_id") WHERE "ai_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "ai_runs_message_idx" ON "ai_runs" USING btree ("tenant_id","message_id","created_at");--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_provenance" CHECK ("drafts"."provenance" in ('sample', 'openai'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "ai_runs" AS PERMISSIVE FOR ALL TO public USING ("ai_runs"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("ai_runs"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));
--> statement-breakpoint
-- Runtime privileges and FORCE RLS are intentionally maintained alongside generated SQL.
ALTER TABLE ai_runs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ai_runs TO trustdesk_app;
--> statement-breakpoint
GRANT INSERT ON drafts TO trustdesk_app;
