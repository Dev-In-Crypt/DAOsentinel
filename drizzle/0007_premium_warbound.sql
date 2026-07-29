CREATE TABLE IF NOT EXISTS "org_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"dao_id" uuid NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"risk_level" text NOT NULL,
	"payload" jsonb,
	"sent_at" timestamp with time zone,
	"recipient_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_reports" ADD CONSTRAINT "org_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_reports" ADD CONSTRAINT "org_reports_dao_id_daos_id_fk" FOREIGN KEY ("dao_id") REFERENCES "public"."daos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_org_reports_week" ON "org_reports" USING btree ("organization_id","dao_id","week_start");