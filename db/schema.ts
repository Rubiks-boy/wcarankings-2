import { index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

export const rankingEntries = pgTable(
  "ranking_entries",
  {
    eventId: text("event_id").notNull(),
    rankingType: text("ranking_type", { enum: ["single", "average"] }).notNull(),
    personId: text("person_id").notNull(),
    personName: text("person_name").notNull(),
    countryId: text("country_id").notNull(),
    countryName: text("country_name").notNull(),
    countryIso2: text("country_iso2").notNull(),
    continentId: text("continent_id").notNull(),
    best: integer("best").notNull(),
    competitionId: text("competition_id").notNull(),
    competitionName: text("competition_name").notNull(),
    worldRank: integer("world_rank").notNull(),
    continentRank: integer("continent_rank").notNull(),
    countryRank: integer("country_rank").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.rankingType, table.personId] }),
    index("ranking_world_idx").on(table.eventId, table.rankingType, table.worldRank, table.personId),
    index("ranking_continent_idx").on(
      table.eventId,
      table.rankingType,
      table.continentId,
      table.continentRank,
      table.personId,
    ),
    index("ranking_country_idx").on(
      table.eventId,
      table.rankingType,
      table.countryId,
      table.countryRank,
      table.personId,
    ),
    index("ranking_person_idx").on(table.personId, table.eventId, table.rankingType),
  ],
);

export const rankingCounts = pgTable(
  "ranking_counts",
  {
    eventId: text("event_id").notNull(),
    rankingType: text("ranking_type", { enum: ["single", "average"] }).notNull(),
    scope: text("scope", { enum: ["world", "continent", "country"] }).notNull(),
    regionId: text("region_id").notNull().default(""),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.rankingType, table.scope, table.regionId] })],
);

export const exportMetadata = pgTable("export_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
