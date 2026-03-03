import { describe, expect, it } from "vitest";

import { createTempWorkspace } from "../../helpers/temp-workspace";
import { parseEnv } from "../../../src/config/env";
import { resolveRuntimePaths } from "../../../src/config/paths";
import {
  formatSchedulerSlotKey,
  isSchedulerSlotDue,
  parseScheduleTime,
  runSchedulerTick,
} from "../../../src/runtime/scheduler";

describe("scheduler", () => {
  it("evaluates local-time schedule slots", () => {
    expect(parseScheduleTime("08:15")).toEqual({ hour: 8, minute: 15 });
    expect(isSchedulerSlotDue(new Date(2026, 1, 23, 8, 14), "08:15")).toBe(false);
    expect(isSchedulerSlotDue(new Date(2026, 1, 23, 8, 15), "08:15")).toBe(true);
    expect(formatSchedulerSlotKey(new Date(2026, 1, 23, 8, 15), "08:15")).toBe("2026-02-23@08:15");
  });

  it("returns not_due before the configured time and executes once when due", async () => {
    const workspace = await createTempWorkspace();

    try {
      const paths = resolveRuntimePaths({
        cwd: workspace.root,
        env: parseEnv({ REPORTS_DIR: "reports", RUN_LOG_PATH: "logs/runs.jsonl" }),
      });
      let calls = 0;

      const before = await runSchedulerTick({
        paths,
        scheduleTime: "08:15",
        now: new Date(2026, 1, 23, 8, 14),
        runReview: async () => {
          calls += 1;
          return 0;
        },
      });
      expect(before.status).toBe("not_due");
      expect(calls).toBe(0);

      const due = await runSchedulerTick({
        paths,
        scheduleTime: "08:15",
        now: new Date(2026, 1, 23, 8, 15),
        runReview: async () => {
          calls += 1;
          return 0;
        },
      });
      expect(due.status).toBe("started");
      expect(calls).toBe(1);
    } finally {
      await workspace.cleanup();
    }
  });
});
