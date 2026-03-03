import { describe, expect, it } from "vitest";

import {
  appendRunLogEntry,
  findRunLogEntriesByRunId,
  findRunLogEntriesByStatus,
  readRunLogHistory,
} from "../../../src/runtime/run-log";
import { createTempWorkspace } from "../../helpers/temp-workspace";

describe("run log history helpers", () => {
  it("reads appended history and supports simple queries", async () => {
    const workspace = await createTempWorkspace();
    try {
      const path = workspace.path("logs", "runs.jsonl");
      await appendRunLogEntry(path, {
        runId: "a",
        triggerType: "manual",
        startedAt: "2026-02-23T08:00:00.000Z",
        status: "success",
        llmStatus: "not_used",
        messages: ["ok"],
      });
      await appendRunLogEntry(path, {
        runId: "a",
        triggerType: "manual",
        startedAt: "2026-02-23T08:05:00.000Z",
        status: "failed",
        llmStatus: "not_used",
        messages: ["fail"],
      });
      await appendRunLogEntry(path, {
        runId: "b",
        triggerType: "scheduled",
        startedAt: "2026-02-23T08:10:00.000Z",
        status: "skipped_duplicate",
        llmStatus: "not_used",
        messages: ["dup"],
      });

      expect((await readRunLogHistory(path)).length).toBe(3);
      expect((await findRunLogEntriesByRunId(path, "a")).length).toBe(2);
      expect((await findRunLogEntriesByStatus(path, "skipped_duplicate")).length).toBe(1);
    } finally {
      await workspace.cleanup();
    }
  });
});
