CREATE TABLE "card_edition_faces" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"edition_id" uuid NOT NULL,
	"side" text NOT NULL,
	"source_id" text NOT NULL,
	"slug" text NOT NULL,
	"illustrator" text,
	"collaborators" text[] DEFAULT '{}' NOT NULL,
	"flavor" text,
	"image_source_path" text NOT NULL,
	"image_id" uuid,
	"source_updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "card_edition_faces_source_id_unique" UNIQUE("source_id"),
	CONSTRAINT "card_edition_faces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "card_editions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_id" uuid NOT NULL,
	"set_id" uuid NOT NULL,
	"collector_number" text NOT NULL,
	"rarity" smallint NOT NULL,
	"is_default" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_faces" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"card_id" uuid NOT NULL,
	"side" text NOT NULL,
	"source_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"elements" text[] NOT NULL,
	"classes" text[] NOT NULL,
	"types" text[] NOT NULL,
	"subtypes" text[] NOT NULL,
	"cost_type" text NOT NULL,
	"cost_value" smallint,
	"cost_is_x" boolean DEFAULT false NOT NULL,
	"level" smallint,
	"life" smallint,
	"power" smallint,
	"durability" smallint,
	"speed" text,
	"effect" text,
	"effect_raw" text,
	"source_updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "card_faces_source_id_unique" UNIQUE("source_id"),
	CONSTRAINT "card_faces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "card_references" (
	"from_card_id" uuid NOT NULL,
	"to_card_id" uuid NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "card_references_from_card_id_to_card_id_kind_pk" PRIMARY KEY("from_card_id","to_card_id","kind")
);
--> statement-breakpoint
CREATE TABLE "card_rulings" (
	"card_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"title" text,
	"added_on" date NOT NULL,
	"description" text NOT NULL,
	CONSTRAINT "card_rulings_card_id_position_pk" PRIMARY KEY("card_id","position")
);
--> statement-breakpoint
CREATE TABLE "card_sets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_id" text NOT NULL,
	"prefix" text NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"release_date" date,
	"source_updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "card_sets_source_id_unique" UNIQUE("source_id"),
	CONSTRAINT "card_sets_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"legality" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"source_url" text,
	"source_etag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "images_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "card_edition_faces" ADD CONSTRAINT "card_edition_faces_edition_id_card_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."card_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_edition_faces" ADD CONSTRAINT "card_edition_faces_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_editions" ADD CONSTRAINT "card_editions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_editions" ADD CONSTRAINT "card_editions_set_id_card_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."card_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_faces" ADD CONSTRAINT "card_faces_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_references" ADD CONSTRAINT "card_references_from_card_id_cards_id_fk" FOREIGN KEY ("from_card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_references" ADD CONSTRAINT "card_references_to_card_id_cards_id_fk" FOREIGN KEY ("to_card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_rulings" ADD CONSTRAINT "card_rulings_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_edition_faces_edition_id_side_idx" ON "card_edition_faces" USING btree ("edition_id","side");--> statement-breakpoint
CREATE INDEX "card_edition_faces_image_id_idx" ON "card_edition_faces" USING btree ("image_id");--> statement-breakpoint
CREATE INDEX "card_editions_card_id_idx" ON "card_editions" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "card_editions_set_id_idx" ON "card_editions" USING btree ("set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_editions_default_idx" ON "card_editions" USING btree ("card_id") WHERE "card_editions"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "card_faces_card_id_side_idx" ON "card_faces" USING btree ("card_id","side");--> statement-breakpoint
CREATE INDEX "card_references_to_card_id_idx" ON "card_references" USING btree ("to_card_id");--> statement-breakpoint
CREATE VIEW "public"."card_fronts" AS (select "id", "card_id", "side", "source_id", "slug", "name", "elements", "classes", "types", "subtypes", "cost_type", "cost_value", "cost_is_x", "level", "life", "power", "durability", "speed", "effect", "effect_raw", "source_updated_at" from "card_faces" where "card_faces"."side" = 'front');