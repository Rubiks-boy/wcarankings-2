import { query } from "@/db";
import { getImportHealthStatus, getMigrationHealthStatus } from "@/lib/import-health";

export const dynamic = "force-dynamic";

type ImportRunRow = {
  id: number;
  export_date: string | null;
  export_format_version: string | null;
  status: string;
  started_at: string;
  fetch_started_at: string | null;
  fetched_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  failure_message: string | null;
  projection_swap_status: string;
  source_person_count: number | null;
  source_result_count: number | null;
  published_ranking_count: number | null;
  event_count: number | null;
  region_count: number | null;
  aggregate_count: number | null;
};

type MigrationRow = {
  installed_rank: number;
  version: string | null;
  description: string;
  script: string;
  installed_on: string;
  execution_time: number;
  success: number | boolean;
};

function serializeRun(run: ImportRunRow | null) {
  if (!run) return null;
  return {
    id: Number(run.id),
    exportDate: run.export_date,
    exportFormatVersion: run.export_format_version,
    status: run.status,
    startedAt: run.started_at,
    fetchStartedAt: run.fetch_started_at,
    fetchedAt: run.fetched_at,
    completedAt: run.completed_at,
    durationMs: run.duration_ms == null ? null : Number(run.duration_ms),
    failureMessage: run.failure_message,
    projectionSwapStatus: run.projection_swap_status,
    counts: {
      sourcePeople: run.source_person_count == null ? null : Number(run.source_person_count),
      sourceResults: run.source_result_count == null ? null : Number(run.source_result_count),
      publishedRankings: run.published_ranking_count == null ? null : Number(run.published_ranking_count),
      events: run.event_count == null ? null : Number(run.event_count),
      regions: run.region_count == null ? null : Number(run.region_count),
      aggregates: run.aggregate_count == null ? null : Number(run.aggregate_count),
    },
  };
}

async function getMigrationHealth() {
  try {
    const migrations = await query<MigrationRow>(`
      SELECT installed_rank, version, description, script, installed_on, execution_time, success
      FROM flyway_schema_history
      ORDER BY installed_rank DESC
      LIMIT 1
    `);
    const latest = migrations.rows[0] ?? null;
    return {
      status: getMigrationHealthStatus(latest),
      latest: latest ? {
        installedRank: Number(latest.installed_rank),
        version: latest.version,
        description: latest.description,
        script: latest.script,
        installedOn: latest.installed_on,
        executionTimeMs: Number(latest.execution_time),
        success: Boolean(latest.success),
      } : null,
    };
  } catch {
    return {
      status: "unavailable" as const,
      latest: null,
    };
  }
}

export async function GET() {
  try {
    const [metadata, latest, successful, failures, migrations] = await Promise.all([
      query<{ key: string; value: string }>("SELECT `key`, value FROM export_metadata WHERE `key` IN ('export_date', 'export_format_version', 'fetched_at')"),
      query<ImportRunRow>("SELECT * FROM import_runs ORDER BY id DESC LIMIT 1"),
      query<ImportRunRow>("SELECT * FROM import_runs WHERE status = 'succeeded' ORDER BY id DESC LIMIT 1"),
      query<ImportRunRow>("SELECT * FROM import_runs WHERE status = 'failed' ORDER BY id DESC LIMIT 5"),
      getMigrationHealth(),
    ]);
    const currentExport = Object.fromEntries(metadata.rows.map((row) => [row.key, row.value]));
    const latestRun = latest.rows[0] ?? null;
    return Response.json({
      status: getImportHealthStatus({ latestRun, currentExport: currentExport.export_date }),
      currentExport: currentExport.export_date ? {
        date: currentExport.export_date,
        formatVersion: currentExport.export_format_version ?? null,
        fetchedAt: currentExport.fetched_at ?? null,
      } : null,
      latestRun: serializeRun(latestRun),
      lastSuccessfulRun: serializeRun(successful.rows[0] ?? null),
      recentFailures: failures.rows.map(serializeRun),
      migrations,
      diagnostics: latestRun
        ? `import_run_id=${latestRun.id}; status=${latestRun.status}; projection_swap=${latestRun.projection_swap_status}; migration=${migrations.status}; migration_version=${migrations.latest?.version ?? "none"}`
        : `No import run has been recorded. migration=${migrations.status}; migration_version=${migrations.latest?.version ?? "none"}`,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({
      status: "empty",
      currentExport: null,
      latestRun: null,
      lastSuccessfulRun: null,
      recentFailures: [],
      migrations: {
        status: "unavailable",
        latest: null,
      },
      diagnostics: "Import health is unavailable because the application database could not be queried.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
