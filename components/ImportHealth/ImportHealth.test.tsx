import assert from "node:assert/strict";
import test from "node:test";
import { getImportHealthStatus, getMigrationHealthStatus, formatDuration } from "@/lib/import-health";

test("distinguishes empty, running, successful, and failed imports", () => {
  assert.equal(getImportHealthStatus({ currentExport: null, latestRun: null }), "empty");
  assert.equal(getImportHealthStatus({ currentExport: "2026-07-27", latestRun: { status: "running" } }), "import_running");
  assert.equal(getImportHealthStatus({ currentExport: "2026-07-27", latestRun: { status: "succeeded" } }), "last_import_succeeded");
  assert.equal(getImportHealthStatus({ currentExport: "2026-07-27", latestRun: { status: "failed" } }), "last_import_failed");
  assert.equal(formatDuration(1250), "1.3 s");
});

test("summarizes Flyway migration history without exposing database details", () => {
  assert.equal(getMigrationHealthStatus(null), "empty");
  assert.equal(getMigrationHealthStatus({ success: 1 }), "succeeded");
  assert.equal(getMigrationHealthStatus({ success: true }), "succeeded");
  assert.equal(getMigrationHealthStatus({ success: 0 }), "failed");
});
