import { parseEnv } from "../config/env";
import { resolveRuntimePaths } from "../config/paths";
import { createSystemClock } from "../shared/time";
import type { AppClock, AppContext } from "../shared/types";

type EnvInput = Record<string, string | undefined>;

export function createAppContext(options?: {
  cwd?: string;
  env?: EnvInput;
  clock?: AppClock;
}): AppContext {
  const env = parseEnv(options?.env);
  const paths = resolveRuntimePaths({
    cwd: options?.cwd,
    env,
  });

  return {
    env,
    paths,
    clock: options?.clock ?? createSystemClock(),
  };
}
