import { dirname, resolve } from "node:path";

import type { AppEnv, RuntimePaths } from "../shared/types";

export function resolveRuntimePath(cwd: string, value: string): string {
  return resolve(cwd, value);
}

export function resolveRuntimePaths(options: { cwd?: string; env: AppEnv }): RuntimePaths {
  const cwd = options.cwd ?? process.cwd();
  const reportsDir = resolveRuntimePath(cwd, options.env.reportsDir);
  const runLogPath = resolveRuntimePath(cwd, options.env.runLogPath);

  return {
    cwd,
    configDir: resolve(cwd, "config"),
    skillsDir: resolve(cwd, "skills"),
    reportsDir,
    logsDir: dirname(runLogPath),
    runLogPath,
    rssFeedsPath: resolve(cwd, "config", "rss-feeds.md"),
    watchlistPath: resolve(cwd, "config", "watchlist.json"),
  };
}
