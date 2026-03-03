import { describe, expect, it } from "vitest";

import { parseEnv } from "../../../src/config/env";
import { resolveRuntimePaths } from "../../../src/config/paths";
import { ValidationError } from "../../../src/shared/errors";
import { createTempWorkspace } from "../../helpers/temp-workspace";

describe("environment and path resolution", () => {
  it("uses default report and run-log paths when env vars are absent", () => {
    const env = parseEnv({});
    const paths = resolveRuntimePaths({
      cwd: "/workspace/project",
      env,
    });

    expect(env.reportsDir).toBe("reports");
    expect(env.runLogPath).toBe("logs/runs.jsonl");
    expect(paths.reportsDir).toBe("/workspace/project/reports");
    expect(paths.runLogPath).toBe("/workspace/project/logs/runs.jsonl");
    expect(paths.rssFeedsPath).toBe("/workspace/project/config/rss-feeds.md");
    expect(paths.watchlistPath).toBe("/workspace/project/config/watchlist.json");
  });

  it("resolves custom relative runtime paths from the provided cwd", async () => {
    const workspace = await createTempWorkspace();

    try {
      const env = parseEnv({
        REPORTS_DIR: "out/reports",
        RUN_LOG_PATH: "var/logs/runs.jsonl",
      });
      const paths = resolveRuntimePaths({
        cwd: workspace.root,
        env,
      });

      expect(paths.reportsDir).toBe(workspace.path("out", "reports"));
      expect(paths.runLogPath).toBe(workspace.path("var", "logs", "runs.jsonl"));
      expect(paths.logsDir).toBe(workspace.path("var", "logs"));
    } finally {
      await workspace.cleanup();
    }
  });

  it("rejects invalid run-log file extensions", () => {
    expect(() =>
      parseEnv({
        RUN_LOG_PATH: "logs/runs.log",
      }),
    ).toThrowError(ValidationError);
  });
});
