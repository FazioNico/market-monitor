import { mkdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { createTempWorkspace } from "../helpers/temp-workspace";
import { parseEnv } from "../../src/config/env";
import { resolveRuntimePaths } from "../../src/config/paths";
import { readRunLogEntries } from "../../src/runtime/run-log";
import { runSchedulerTick } from "../../src/runtime/scheduler";

describe("scheduler duplicate guard (functional)", () => {
  it("runs once per slot and logs duplicate attempts as skipped", async () => {
    const workspace = await createTempWorkspace();

    try {
      await mkdir(workspace.path("logs"), { recursive: true });
      const paths = resolveRuntimePaths({
        cwd: workspace.root,
        env: parseEnv({ REPORTS_DIR: "reports", RUN_LOG_PATH: "logs/runs.jsonl" }),
      });

      let calls = 0;
      const now = new Date(2026, 1, 23, 8, 15);
      const runner = async () => {
        calls += 1;
        return 0;
      };

      const first = await runSchedulerTick({
        paths,
        scheduleTime: "08:15",
        now,
        runReview: async ({ triggerType, scheduleSlotKey }) => runner(),
      });
      const second = await runSchedulerTick({
        paths,
        scheduleTime: "08:15",
        now: new Date(2026, 1, 23, 8, 16),
        runReview: async ({ triggerType, scheduleSlotKey }) => runner(),
      });

      expect(first.status).toBe("started");
      expect(second.status).toBe("skipped_duplicate");
      expect(calls).toBe(1);

      const entries = await readRunLogEntries(paths.runLogPath);
      expect(entries.some((entry) => entry.status === "skipped_duplicate")).toBe(true);
    } finally {
      await workspace.cleanup();
    }
  });
});
