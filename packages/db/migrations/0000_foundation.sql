CREATE TABLE "approvers" (
	"tenant_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "approvers_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "approvers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalogue_rows" (
	"tenant_id" text NOT NULL,
	"version" text NOT NULL,
	"id" text NOT NULL,
	"item" text NOT NULL,
	"item_arabic" text,
	"rent_per_month_minor" bigint,
	"buy_minor" bigint,
	"per_day_minor" bigint,
	"per_shift_minor" bigint,
	"flat_minor" bigint,
	CONSTRAINT "catalogue_rows_tenant_id_version_id_pk" PRIMARY KEY("tenant_id","version","id"),
	CONSTRAINT "catalogue_rows_price_shape" CHECK ((
    (num_nonnulls("catalogue_rows"."rent_per_month_minor", "catalogue_rows"."buy_minor") >= 1 and num_nonnulls("catalogue_rows"."per_day_minor", "catalogue_rows"."per_shift_minor", "catalogue_rows"."flat_minor") = 0)
    or ("catalogue_rows"."rent_per_month_minor" is null and "catalogue_rows"."buy_minor" is null and num_nonnulls("catalogue_rows"."per_day_minor", "catalogue_rows"."per_shift_minor", "catalogue_rows"."flat_minor") = 1)
  )),
	CONSTRAINT "catalogue_rows_nonnegative" CHECK ("catalogue_rows"."rent_per_month_minor" >= 0 and "catalogue_rows"."buy_minor" >= 0 and "catalogue_rows"."per_day_minor" >= 0 and "catalogue_rows"."per_shift_minor" >= 0 and "catalogue_rows"."flat_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "catalogue_rows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "catalogue_versions" (
	"tenant_id" text NOT NULL,
	"version" text NOT NULL,
	"source" text NOT NULL,
	"source_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalogue_versions_tenant_id_version_pk" PRIMARY KEY("tenant_id","version"),
	CONSTRAINT "catalogue_versions_hash" CHECK ("catalogue_versions"."source_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "catalogue_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "receiving_channels" (
	"tenant_id" text NOT NULL,
	"channel" text NOT NULL,
	"address" text NOT NULL,
	CONSTRAINT "receiving_channels_channel_address_pk" PRIMARY KEY("channel","address"),
	CONSTRAINT "receiving_channels_kind" CHECK ("receiving_channels"."channel" in ('whatsapp', 'email', 'webform'))
);
--> statement-breakpoint
ALTER TABLE "receiving_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"location" text NOT NULL,
	"timezone" text NOT NULL,
	"sells" text NOT NULL,
	"currency" text NOT NULL,
	"currency_minor_units" integer NOT NULL,
	"vat_basis_points" integer NOT NULL,
	"languages" text[] NOT NULL,
	"auto_send" text NOT NULL,
	"discount_threshold_basis_points" integer NOT NULL,
	"service_areas" text[] NOT NULL,
	"outside_service_area" text NOT NULL,
	"minimum_order_minor" bigint DEFAULT 0 NOT NULL,
	"faq" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_id_format" CHECK ("tenants"."id" ~ '^[a-z][a-z0-9_-]{0,63}$'),
	CONSTRAINT "tenants_currency" CHECK ("tenants"."currency" in ('AED', 'SAR') and "tenants"."currency_minor_units" = 2),
	CONSTRAINT "tenants_rates" CHECK ("tenants"."vat_basis_points" between 0 and 10000 and "tenants"."discount_threshold_basis_points" between 0 and 10000),
	CONSTRAINT "tenants_policy" CHECK ("tenants"."auto_send" in ('low_risk_only', 'off') and "tenants"."outside_service_area" = 'hand_off' and "tenants"."minimum_order_minor" >= 0),
	CONSTRAINT "tenants_lists" CHECK (cardinality("tenants"."languages") > 0 and "tenants"."languages" <@ array['ar','en']::text[] and cardinality("tenants"."service_areas") > 0)
);
--> statement-breakpoint
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "approvers" ADD CONSTRAINT "approvers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_rows" ADD CONSTRAINT "catalogue_rows_version_fk" FOREIGN KEY ("tenant_id","version") REFERENCES "public"."catalogue_versions"("tenant_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_versions" ADD CONSTRAINT "catalogue_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receiving_channels" ADD CONSTRAINT "receiving_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receiving_channels_tenant_idx" ON "receiving_channels" USING btree ("tenant_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "approvers" AS PERMISSIVE FOR ALL TO public USING ("approvers"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("approvers"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "catalogue_rows" AS PERMISSIVE FOR ALL TO public USING ("catalogue_rows"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("catalogue_rows"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "catalogue_versions" AS PERMISSIVE FOR ALL TO public USING ("catalogue_versions"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("catalogue_versions"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "receiving_channels" AS PERMISSIVE FOR ALL TO public USING ("receiving_channels"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("receiving_channels"."tenant_id" = (select nullif(current_setting('app.tenant_id', true), '')));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenants" AS PERMISSIVE FOR ALL TO public USING ("tenants"."id" = (select nullif(current_setting('app.tenant_id', true), ''))) WITH CHECK ("tenants"."id" = (select nullif(current_setting('app.tenant_id', true), '')));