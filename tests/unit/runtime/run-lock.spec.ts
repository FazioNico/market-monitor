import { describe, expect, it } from "vitest";

import { acquireRunLock, buildRunLockPath, releaseRunLock } from "../../../src/runtime/run-lock";
import { createTempWorkspace } from "../../helpers/temp-workspace";

describe("run lock", () => {
  it("acquires and blocks duplicates until expiration, then can be released", async () => {
    const workspace = await createTempWorkspace();

    try {
      const lockPath = buildRunLockPath(workspace.path("locks"), "2026-02-23@08:00");
      const first = await acquireRunLock({
        lockPath,
        lockKey: "2026-02-23@08:00",
        runId: "run_1",
        now: new Date("2026-02-23T08:00:00Z"),
        ttlMs: 60_000,
      });
      expect(first.acquired).toBe(true);

      const second = await acquireRunLock({
        lockPath,
        lockKey: "2026-02-23@08:00",
        runId: "run_2",
        now: new Date("2026-02-23T08:00:30Z"),
        ttlMs: 60_000,
      });
      expect(second.acquired).toBe(false);

      await releaseRunLock(lockPath);

      const third = await acquireRunLock({
        lockPath,
        lockKey: "2026-02-23@08:00",
        runId: "run_3",
        now: new Date("2026-02-23T08:01:00Z"),
        ttlMs: 60_000,
      });
      expect(third.acquired).toBe(true);
    } finally {
      await workspace.cleanup();
    }
  });
});
