CREATE TABLE "export_metadata" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranking_counts" (
	"event_id" text NOT NULL,
	"ranking_type" text NOT NULL,
	"scope" text NOT NULL,
	"region_id" text DEFAULT '' NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "ranking_counts_event_id_ranking_type_scope_region_id_pk" PRIMARY KEY("event_id","ranking_type","scope","region_id")
);
--> statement-breakpoint
CREATE TABLE "ranking_entries" (
	"event_id" text NOT NULL,
	"ranking_type" text NOT NULL,
	"person_id" text NOT NULL,
	"person_name" text NOT NULL,
	"country_id" text NOT NULL,
	"country_name" text NOT NULL,
	"country_iso2" text NOT NULL,
	"continent_id" text NOT NULL,
	"best" integer NOT NULL,
	"world_rank" integer NOT NULL,
	"continent_rank" integer NOT NULL,
	"country_rank" integer NOT NULL,
	CONSTRAINT "ranking_entries_event_id_ranking_type_person_id_pk" PRIMARY KEY("event_id","ranking_type","person_id")
);
--> statement-breakpoint
CREATE INDEX "ranking_world_idx" ON "ranking_entries" USING btree ("event_id","ranking_type","world_rank","person_id");--> statement-breakpoint
CREATE INDEX "ranking_continent_idx" ON "ranking_entries" USING btree ("event_id","ranking_type","continent_id","continent_rank","person_id");--> statement-breakpoint
CREATE INDEX "ranking_country_idx" ON "ranking_entries" USING btree ("event_id","ranking_type","country_id","country_rank","person_id");--> statement-breakpoint
CREATE INDEX "ranking_person_idx" ON "ranking_entries" USING btree ("person_id","event_id","ranking_type");