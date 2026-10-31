CREATE TABLE "settings_changes" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"approver_id" text NOT NULL,
	"approver_name" text NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_changes_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "settings_changes_reason" CHECK (length(btrim("settings_changes"."reason")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "settings_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "settings_changes" ADD CONSTRAINT "settings_changes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings_changes" ADD CONSTRAINT "settings_changes_tenant_id_approver_id_approvers_tenant_id_id_fk" FOREIGN KEY ("tenant_id","approver_id") REFERENCES "public"."approvers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "settings_changes_tenant_time_idx" ON "settings_changes" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "settings_changes" AS PERMISSIVE FOR ALL TO public USING ("settings_changes"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("settings_changes"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));
--> statement-breakpoint
ALTER TABLE settings_changes FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON settings_changes TO trustdesk_app;
-- Identity, routing and published catalogue prices remain read-only.
GRANT UPDATE (vat_basis_points, discount_threshold_basis_points, minimum_order_minor,
  service_areas, faq, auto_send, commercial_rules) ON tenants TO trustdesk_app;
