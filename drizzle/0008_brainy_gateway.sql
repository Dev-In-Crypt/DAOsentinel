CREATE TABLE IF NOT EXISTS "address_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dao_id" uuid NOT NULL,
	"address" text NOT NULL,
	"label" text NOT NULL,
	"source" text NOT NULL,
	"source_detail" text,
	"signer_count" integer,
	"threshold" integer,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "address_labels" ADD CONSTRAINT "address_labels_dao_id_daos_id_fk" FOREIGN KEY ("dao_id") REFERENCES "public"."daos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_address_labels_dao_address" ON "address_labels" USING btree ("dao_id","address");