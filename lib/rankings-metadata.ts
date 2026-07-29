import { query } from "@/db";
import { RANKINGS_CACHE_REFRESH_MS, rankingsPageCache } from "@/lib/rankings-cache";
import type { RankingType, RegionScope } from "@/lib/wca";

type CountRow = { event_id: string; ranking_type: RankingType; scope: RegionScope; region_id: string; count: number };
type YearCountRow = { year: number; event_id: string; ranking_type: RankingType; cohort_id: number; scope: RegionScope; region_id: string; count: number };
type MetadataRow = { key: string; value: string };

export type RankingsMetadata = {
  fetchedAt: string;
  exportDate: string | null;
  counts: Map<string, number>;
  yearCounts: Map<string, number>;
  availableYears: number[];
  yearProjectionAvailable: boolean;
};

let snapshot: RankingsMetadata | null = null;
let loading: Promise<RankingsMetadata> | null = null;
let refreshing: Promise<RankingsMetadata> | null = null;
let lastVersionCheck = 0;
let readiness: Promise<void> | null = null;

function countKey(eventId: string, type: RankingType, scope: RegionScope, regionId: string) {
  return `${eventId}:${type}:${scope}:${regionId}`;
}
function yearCountKey(year: number, eventId: string, type: RankingType, scope: RegionScope, regionId: string) {
  return `${year}:${countKey(eventId, type, scope, regionId)}`;
}

async function loadYearCounts() {
  try {
    const result = await query<YearCountRow>(`SELECT counts.year, counts.event_id, counts.ranking_type, counts.cohort_id, cohorts.scope, cohorts.region_id, counts.count
      FROM person_year_ranking_counts counts
      JOIN person_year_ranking_cohorts cohorts ON cohorts.cohort_id = counts.cohort_id`);
    return { rows: result.rows, available: true };
  } catch (error) {
    // Deploying the application before a targeted yearly backfill must not
    // interrupt existing all-time rankings. A year request remains a clear
    // unavailable-year response until these projections are published.
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") {
      return { rows: [] as YearCountRow[], available: false };
    }
    throw error;
  }
}

async function loadSnapshot() {
  const [counts, yearCounts, metadata] = await Promise.all([
    query<CountRow>("SELECT event_id, ranking_type, scope, region_id, count FROM ranking_counts"),
    loadYearCounts(),
    query<MetadataRow>("SELECT `key`, value FROM export_metadata WHERE `key` IN ('export_date', 'fetched_at')"),
  ]);
  const values = new Map(metadata.rows.map((row) => [row.key, row.value]));
  const fetchedAt = values.get("fetched_at");
  if (!fetchedAt) throw new Error("Ranking metadata is missing fetched_at.");
  return {
    fetchedAt,
    exportDate: values.get("export_date") ?? null,
    counts: new Map(counts.rows.map((row) => [countKey(row.event_id, row.ranking_type, row.scope, row.region_id), Number(row.count)])),
    yearCounts: new Map(yearCounts.rows.map((row) => [yearCountKey(Number(row.year), row.event_id, row.ranking_type, row.scope, row.region_id), Number(row.count)])),
    availableYears: [...new Set(yearCounts.rows.map((row) => Number(row.year)))].sort((left, right) => right - left),
    yearProjectionAvailable: yearCounts.available,
  };
}

export async function getRankingsMetadata() {
  if (snapshot) return snapshot;
  if (!loading) loading = loadSnapshot().then((next) => {
    snapshot = next;
    lastVersionCheck = Date.now();
    return next;
  }).finally(() => { loading = null; });
  return loading;
}

export async function refreshRankingsMetadata() {
  const now = Date.now();
  if (!snapshot || now - lastVersionCheck >= RANKINGS_CACHE_REFRESH_MS) {
    lastVersionCheck = now;
    if (!refreshing) {
      refreshing = (async () => {
        const version = await query<{ value: string }>("SELECT value FROM export_metadata WHERE `key` = 'fetched_at'");
        const fetchedAt = version.rows[0]?.value;
        if (!fetchedAt) throw new Error("Ranking metadata is missing fetched_at.");
        if (!snapshot || fetchedAt !== snapshot.fetchedAt || !snapshot.yearProjectionAvailable) {
          const next = await loadSnapshot();
          snapshot = next;
          rankingsPageCache.clear();
          readiness = null;
        }
        return snapshot;
      })().finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  return snapshot;
}

export async function getCurrentRankingsMetadata() {
  await getRankingsMetadata();
  return refreshRankingsMetadata();
}

export function getRankingCount(metadata: RankingsMetadata, eventId: string, type: RankingType, scope: RegionScope, regionId: string) {
  const count = metadata.counts.get(countKey(eventId, type, scope, regionId));
  if (count === undefined) throw new Error("Ranking count metadata is missing for this cohort.");
  return count;
}

export function getYearRankingCount(metadata: RankingsMetadata, year: number, eventId: string, type: RankingType, scope: RegionScope, regionId: string) {
  return metadata.yearCounts.get(yearCountKey(year, eventId, type, scope, regionId)) ?? 0;
}

export async function assertRankingsReady() {
  if (!readiness) readiness = (async () => {
    const tables = ["ranking_entries_single", "ranking_entries_average", "person_year_ranking_cohorts", "person_year_rankings_single", "person_year_rankings_average", "person_year_ranking_counts"];
    const columns = ["event_id", "world_rank", "world_sub_rank", "continent_id", "continent_rank", "continent_sub_rank", "country_id", "country_rank", "country_sub_rank"];
    const indexes = ["idx_ranking_entries_world", "idx_ranking_entries_continent", "idx_ranking_entries_country"];
    const [tableRows, columnRows, indexRows, yearlyRows] = await Promise.all([
      query<{ name: string }>(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (${tables.map(() => "?").join(", ")})`, tables),
      query<{ table_name: string; column_name: string }>("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN (?, ?) AND column_name IN (?, ?, ?, ?, ?, ?, ?, ?, ?)", [...tables, ...columns]),
      query<{ table_name: string; index_name: string }>("SELECT table_name, index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name IN (?, ?) AND index_name IN (?, ?, ?)", [...tables, ...indexes]),
      query<{ table_name: string; column_name: string; index_name: string | null }>(`SELECT columns_table.table_name, columns_table.column_name, statistics.index_name
        FROM information_schema.columns columns_table
        LEFT JOIN information_schema.statistics statistics
          ON statistics.table_schema = columns_table.table_schema
         AND statistics.table_name = columns_table.table_name
        WHERE columns_table.table_schema = DATABASE()
          AND columns_table.table_name IN ('person_year_rankings_single', 'person_year_rankings_average', 'person_year_ranking_counts')
          AND (columns_table.column_name IN ('year', 'event_id', 'cohort_id', 'person_id', 'result_id', 'result_value', 'public_rank', 'position', 'ranking_type', 'count')
            OR statistics.index_name IN ('idx_person_year_single_browse', 'idx_person_year_single_person', 'idx_person_year_average_browse', 'idx_person_year_average_person'))`),
    ]);
    for (const table of tables) {
      if (!tableRows.rows.some((row) => row.name === table)) throw new Error(`Required projection ${table} is missing.`);
      if (table.startsWith("person_year_")) continue;
      for (const column of columns) if (!columnRows.rows.some((row) => row.table_name === table && row.column_name === column)) throw new Error(`Required projection column ${table}.${column} is missing.`);
      for (const index of indexes) if (!indexRows.rows.some((row) => row.table_name === table && row.index_name === index)) throw new Error(`Required projection index ${table}.${index} is missing.`);
    }
    const yearlyColumns = ["year", "event_id", "cohort_id", "person_id", "result_id", "result_value", "public_rank", "position"];
    for (const table of ["person_year_rankings_single", "person_year_rankings_average"]) {
      for (const column of yearlyColumns) if (!yearlyRows.rows.some((row) => row.table_name === table && row.column_name === column)) throw new Error(`Required projection column ${table}.${column} is missing.`);
    }
    for (const [table, index] of [["person_year_rankings_single", "idx_person_year_single_browse"], ["person_year_rankings_single", "idx_person_year_single_person"], ["person_year_rankings_average", "idx_person_year_average_browse"], ["person_year_rankings_average", "idx_person_year_average_person"]] as const) {
      if (!yearlyRows.rows.some((row) => row.table_name === table && row.index_name === index)) throw new Error(`Required projection index ${table}.${index} is missing.`);
    }
    await getRankingsMetadata();
  })().catch((error) => { readiness = null; throw error; });
  return readiness;
}

export function resetRankingsMetadataForTests() {
  snapshot = null;
  loading = null;
  refreshing = null;
  readiness = null;
  lastVersionCheck = 0;
}
