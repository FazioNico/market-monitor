import { describe, expect, it } from "vitest";
import { stat } from "node:fs/promises";

import {
  appendRunLogEntry,
  createStartedRunLogEntry,
  readRunLogEntries,
} from "../../../src/runtime/run-log";
import { createTempWorkspace } from "../../helpers/temp-workspace";

describe("append-only JSONL run log", () => {
  it("appends entries in order and preserves prior lines", async () => {
    const workspace = await createTempWorkspace();

    try {
      const runLogPath = workspace.path("logs", "runs.jsonl");

      const first = createStartedRunLogEntry({
        runId: "run_1",
        triggerType: "manual",
        startedAt: "2026-02-23T08:00:00.000Z",
        messages: ["starting"],
      });

      const second = {
        runId: "run_2",
        triggerType: "scheduled" as const,
        startedAt: "2026-02-23T09:00:00.000Z",
        endedAt: "2026-02-23T09:00:10.000Z",
        status: "success" as const,
        reportStatus: "complete" as const,
        reportFilePath: "reports/2026-02-23-09-00_market-report.md",
        llmStatus: "not_used" as const,
        messages: ["done"],
      };

      await appendRunLogEntry(runLogPath, first);
      const sizeAfterFirstWrite = (await stat(runLogPath)).size;

      await appendRunLogEntry(runLogPath, second);
      const sizeAfterSecondWrite = (await stat(runLogPath)).size;

      expect(sizeAfterSecondWrite).toBeGreaterThan(sizeAfterFirstWrite);

      const entries = await readRunLogEntries(runLogPath);
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({ runId: "run_1", status: "started" });
      expect(entries[1]).toMatchObject({ runId: "run_2", status: "success" });
    } finally {
      await workspace.cleanup();
    }
  });

  it("returns an empty list when the log file does not exist yet", async () => {
    const workspace = await createTempWorkspace();

    try {
      const entries = await readRunLogEntries(workspace.path("logs", "runs.jsonl"));
      expect(entries).toEqual([]);
    } finally {
      await workspace.cleanup();
    }
  });
});
