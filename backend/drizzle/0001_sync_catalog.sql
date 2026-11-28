CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_references" DROP CONSTRAINT "card_references_to_card_id_cards_id_fk";
--> statement-breakpoint
DROP INDEX "card_references_to_card_id_idx";--> statement-breakpoint
ALTER TABLE "card_references" DROP CONSTRAINT "card_references_from_card_id_to_card_id_kind_pk";--> statement-breakpoint
ALTER TABLE "card_editions" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "card_references" ADD COLUMN "to_slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "card_references" ADD CONSTRAINT "card_references_from_card_id_to_slug_kind_pk" PRIMARY KEY("from_card_id","to_slug","kind");--> statement-breakpoint
ALTER TABLE "card_sets" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "images" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "policy_jobs_run_after_idx" ON "policy_jobs" USING btree ("run_after") WHERE "policy_jobs"."failed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "card_references_to_slug_idx" ON "card_references" USING btree ("to_slug");--> statement-breakpoint
ALTER TABLE "card_references" DROP COLUMN "to_card_id";--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "synced_at";--> statement-breakpoint
ALTER TABLE "images" DROP COLUMN "source_url";