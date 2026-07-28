"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, formatDuration, type ImportHealthStatus } from "@/lib/import-health";
import styles from "./ImportHealth.module.css";

type ImportRun = {
  id: number;
  exportDate: string | null;
  exportFormatVersion: string | null;
  status: string;
  startedAt: string;
  fetchStartedAt: string | null;
  fetchedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  failureMessage: string | null;
  projectionSwapStatus: string;
  counts: Record<string, number | null>;
};

type HealthPayload = {
  status: ImportHealthStatus;
  currentExport: { date: string; formatVersion: string | null; fetchedAt: string | null } | null;
  latestRun: ImportRun | null;
  lastSuccessfulRun: ImportRun | null;
  recentFailures: ImportRun[];
  diagnostics: string;
};

const statusLabels: Record<ImportHealthStatus, string> = {
  empty: "No import data",
  export_available: "Export available",
  import_running: "Import running",
  last_import_succeeded: "Last import succeeded",
  last_import_failed: "Last import failed",
};

function Metric({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className={styles.metric}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>;
}

export function ImportHealth() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/import-health", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as HealthPayload;
        if (!response.ok) throw new Error(payload.diagnostics);
        return payload;
      })
      .then(setData)
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load import health."));
  }, []);

  if (error) return <main className={styles.page}><p className={styles.alert}>{error}</p></main>;
  if (!data) return <main className={styles.page}><p>Loading import health…</p></main>;

  const run = data.latestRun ?? data.lastSuccessfulRun;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><Link href="/" className={styles.back}>← WCA Rankings</Link><h1>Import health</h1><p>Read-only diagnostics for ranking data freshness and publication.</p></div>
        <strong className={`${styles.status} ${styles[data.status]}`}>{statusLabels[data.status]}</strong>
      </header>

      <section className={styles.card} aria-labelledby="export-heading">
        <h2 id="export-heading">Current published export</h2>
        <dl className={styles.grid}>
          <Metric label="Export date" value={data.currentExport?.date} />
          <Metric label="Format version" value={data.currentExport?.formatVersion} />
          <Metric label="Published at" value={formatDate(data.currentExport?.fetchedAt)} />
          <Metric label="Projection swap" value={run?.projectionSwapStatus} />
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="run-heading">
        <h2 id="run-heading">Latest importer run</h2>
        {run ? <>
          <dl className={styles.grid}>
            <Metric label="Run" value={`#${run.id}`} />
            <Metric label="Status" value={run.status} />
            <Metric label="Started" value={formatDate(run.startedAt)} />
            <Metric label="Fetch started" value={formatDate(run.fetchStartedAt)} />
            <Metric label="Fetched" value={formatDate(run.fetchedAt)} />
            <Metric label="Completed" value={formatDate(run.completedAt)} />
            <Metric label="Duration" value={formatDuration(run.durationMs)} />
          </dl>
          {run.failureMessage && <p className={styles.failure}><strong>Failure:</strong> {run.failureMessage}</p>}
          <h3>Coverage</h3>
          <dl className={styles.grid}>
            <Metric label="Source people" value={run.counts.sourcePeople} />
            <Metric label="Source results" value={run.counts.sourceResults} />
            <Metric label="Published rankings" value={run.counts.publishedRankings} />
            <Metric label="Events" value={run.counts.events} />
            <Metric label="Regions" value={run.counts.regions} />
            <Metric label="Aggregates" value={run.counts.aggregates} />
          </dl>
        </> : <p>No import run has been recorded yet.</p>}
      </section>

      <section className={styles.card} aria-labelledby="failure-heading">
        <h2 id="failure-heading">Recent failures</h2>
        {data.recentFailures.length ? <ul className={styles.failures}>{data.recentFailures.map((failure) => <li key={failure.id}>#{failure.id} · {formatDate(failure.completedAt)} · {failure.failureMessage ?? "Unknown failure"}</li>)}</ul> : <p>No recent failures.</p>}
      </section>

      <section className={styles.card} aria-labelledby="diagnostics-heading">
        <h2 id="diagnostics-heading">Deployment diagnostics</h2>
        <textarea className={styles.diagnostics} readOnly value={data.diagnostics} aria-label="Copyable deployment diagnostics" />
      </section>
    </main>
  );
}
