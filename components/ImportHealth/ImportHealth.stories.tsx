import type { Meta, StoryObj } from "@storybook/react";
import { ImportHealth, type HealthPayload } from "./ImportHealth";

const health: HealthPayload = {
  status: "last_import_succeeded",
  currentExport: { date: "2026-07-27", formatVersion: "1.1", fetchedAt: "2026-07-28T07:15:00Z" },
  latestRun: {
    id: 842,
    exportDate: "2026-07-27",
    exportFormatVersion: "1.1",
    status: "succeeded",
    startedAt: "2026-07-28T07:10:00Z",
    fetchStartedAt: "2026-07-28T07:10:04Z",
    fetchedAt: "2026-07-28T07:13:16Z",
    projectionBuildStartedAt: "2026-07-28T07:13:20Z",
    projectionBuiltAt: "2026-07-28T07:14:52Z",
    projectionBuildDurationMs: 92_000,
    projectionBuildElapsedMs: 92_000,
    completedAt: "2026-07-28T07:15:00Z",
    durationMs: 300_000,
    failureMessage: null,
    projectionSwapStatus: "published",
    counts: { publishedRankings: 21_482, aggregates: 2_742, events: 17, regions: 177 },
  },
  lastSuccessfulRun: null,
  recentFailures: [],
  projectionTables: {
    ready: true,
    tables: [
      { name: "ranking_entries", present: true },
      { name: "ranking_aggregates", present: true },
    ],
  },
  diagnostics: "Published ranking projections are current.",
};

const meta = {
  title: "Pages/ImportHealth",
  component: ImportHealth,
  parameters: { layout: "fullscreen" },
  args: { loadHealth: async () => health },
} satisfies Meta<typeof ImportHealth>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};

export const Failed: Story = {
  args: {
    loadHealth: async () => ({
      ...health,
      status: "last_import_failed",
      recentFailures: [{ ...health.latestRun!, id: 841, status: "failed", failureMessage: "Projection swap timed out.", projectionSwapStatus: "failed" }],
    }),
  },
};
