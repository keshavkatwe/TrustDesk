CREATE TABLE "evaluation_labels" (
	"tenant_id" text NOT NULL,
	"run_id" text NOT NULL,
	"case_id" text NOT NULL,
	"approver_id" text NOT NULL,
	"approver_name" text NOT NULL,
	"dimensions" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_labels_tenant_id_run_id_case_id_pk" PRIMARY KEY("tenant_id","run_id","case_id"),
	CONSTRAINT "evaluation_labels_reason" CHECK (length(btrim("evaluation_labels"."rationale")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "evaluation_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "evaluation_runs" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"agent_id" text NOT NULL,
	"context_hash" text NOT NULL,
	"suite_hash" text NOT NULL,
	"baseline_id" text,
	"accepted" integer DEFAULT 0 NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_runs_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "evaluation_runs_hashes" CHECK ("evaluation_runs"."agent_id" ~ '^[a-f0-9]{64}$' and "evaluation_runs"."context_hash" ~ '^[a-f0-9]{64}$' and "evaluation_runs"."suite_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "evaluation_runs_accepted" CHECK ("evaluation_runs"."accepted" in (0,1))
);
--> statement-breakpoint
ALTER TABLE "evaluation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trust_events" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"agent_id" text NOT NULL,
	"context_hash" text NOT NULL,
	"run_id" text NOT NULL,
	"level" text NOT NULL,
	"approver_id" text,
	"approver_name" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_events_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "trust_events_promotion" CHECK ("trust_events"."level" in ('supervised','autonomous') and ("trust_events"."level" <> 'autonomous' or ("trust_events"."approver_id" is not null and "trust_events"."approver_name" is not null))),
	CONSTRAINT "trust_events_reason" CHECK (length(btrim("trust_events"."reason")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "trust_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evaluation_labels" ADD CONSTRAINT "evaluation_labels_tenant_id_run_id_evaluation_runs_tenant_id_id_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."evaluation_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_labels" ADD CONSTRAINT "evaluation_labels_tenant_id_approver_id_approvers_tenant_id_id_fk" FOREIGN KEY ("tenant_id","approver_id") REFERENCES "public"."approvers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_runs" ADD CONSTRAINT "evaluation_runs_tenant_id_baseline_id_evaluation_runs_tenant_id_id_fk" FOREIGN KEY ("tenant_id","baseline_id") REFERENCES "public"."evaluation_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_tenant_id_run_id_evaluation_runs_tenant_id_id_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."evaluation_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_tenant_id_approver_id_approvers_tenant_id_id_fk" FOREIGN KEY ("tenant_id","approver_id") REFERENCES "public"."approvers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluation_runs_recent_idx" ON "evaluation_runs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "trust_events_version_idx" ON "trust_events" USING btree ("tenant_id","agent_id","context_hash","created_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "evaluation_labels" AS PERMISSIVE FOR ALL TO public USING ("evaluation_labels"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("evaluation_labels"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "evaluation_runs" AS PERMISSIVE FOR ALL TO public USING ("evaluation_runs"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("evaluation_runs"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "trust_events" AS PERMISSIVE FOR ALL TO public USING ("trust_events"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("trust_events"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
ALTER TABLE evaluation_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE evaluation_labels FORCE ROW LEVEL SECURITY;
ALTER TABLE trust_events FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON evaluation_runs, evaluation_labels, trust_events TO trustdesk_app;
