import { ValidationError } from "../shared/errors";
import type { AppEnv } from "../shared/types";
import { normalizeOptionalString } from "../shared/validation";

type RawEnv = Record<string, string | undefined>;

function defaultString(value: string | undefined, fallback: string): string {
  const normalized = normalizeOptionalString(value);
  return normalized ?? fallback;
}

export function parseEnv(env: RawEnv = process.env): AppEnv {
  const reportsDir = defaultString(env.REPORTS_DIR, "reports");
  const runLogPath = defaultString(env.RUN_LOG_PATH, "logs/runs.jsonl");

  const issues: string[] = [];

  if (!runLogPath.endsWith(".jsonl")) {
    issues.push("RUN_LOG_PATH must end with .jsonl");
  }

  if (reportsDir.length === 0) {
    issues.push("REPORTS_DIR must not be empty");
  }

  if (issues.length > 0) {
    throw new ValidationError("Environment validation failed", issues);
  }

  return {
    reportsDir,
    runLogPath,
    fredApiKey: normalizeOptionalString(env.FRED_API_KEY),
    coingeckoApiKey: normalizeOptionalString(env.COINGECKO_API_KEY),
    hyperliquidDex: normalizeOptionalString(env.HYPERLIQUID_DEX),
    llmApiKey: normalizeOptionalString(env.LLM_API_KEY),
    llmBaseUrl: normalizeOptionalString(env.LLM_BASE_URL),
    llmModel: normalizeOptionalString(env.LLM_MODEL),
  };
}
