import type { OutlookDistribution, PositionWordingBlock, RegimeAssessment, SkillDefinition } from "../shared/types";

export interface PositionWordingServiceOptions {
  llmBinding?: (context: { regime: RegimeAssessment; outlook: OutlookDistribution }) => Promise<PositionWordingBlock>;
  skillExecution?: {
    skill: SkillDefinition;
    execute(payload: { regime: RegimeAssessment; outlook: OutlookDistribution }): Promise<unknown>;
  };
  onLlmError?: (error: unknown) => void;
}

function sanitizePhrase(value: string): string {
  return value
    .replace(/\b(amazing|panic|euphoric|guaranteed|certain)\b/gi, "measured")
    .replace(/!/g, ".")
    .trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return normalizeStringArray(JSON.parse(trimmed));
      } catch {
        // fall through to text splitting
      }
    }

    return trimmed
      .split(/\r?\n|;/)
      .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
      .filter(Boolean)
      .map((item) => sanitizePhrase(item));
  }

  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizePhrase(item))
    .filter((item) => item.length > 0);
}

function getField<T = unknown>(data: Record<string, unknown>, keys: string[]): T | undefined {
  for (const key of keys) {
    if (key in data) {
      return data[key] as T;
    }
  }
  return undefined;
}

function unwrapPositionPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const root = raw as Record<string, unknown>;
  const nested = getField<Record<string, unknown>>(root, [
    "positionWording",
    "position_wording",
    "position",
    "output",
    "result",
  ]);

  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested;
  }

  return root;
}

function summarizePayloadForError(raw: unknown): string {
  try {
    if (!raw || typeof raw !== "object") {
      return String(raw);
    }
    const obj = raw as Record<string, unknown>;
    const keys = Object.keys(obj);
    const snippet = JSON.stringify(obj).slice(0, 240);
    return `keys=[${keys.join(", ")}] payload=${snippet}`;
  } catch {
    return "unserializable payload";
  }
}

function normalizeLlmPositionOutput(raw: unknown): PositionWordingBlock {
  const data = unwrapPositionPayload(raw);
  const currentBiasValue = getField<string>(data, ["currentBias", "current_bias"]);
  const timeHorizonValue = getField<string>(data, ["timeHorizon", "time_horizon"]);
  const currentBias =
    typeof currentBiasValue === "string" && currentBiasValue.trim()
      ? sanitizePhrase(currentBiasValue)
      : "Measured neutral bias";
  const addExposureConditions = normalizeStringArray(
    getField(data, ["addExposureConditions", "add_exposure_conditions", "increase_exposure_conditions"]),
  );
  const reduceExposureConditions = normalizeStringArray(
    getField(data, ["reduceExposureConditions", "reduce_exposure_conditions", "decrease_exposure_conditions"]),
  );
  const noTradeZones = normalizeStringArray(
    getField(data, ["noTradeZones", "no_trade_zones", "no_trade_areas", "avoid_zones"]),
  );
  const timeHorizon =
    typeof timeHorizonValue === "string" && timeHorizonValue.trim()
      ? sanitizePhrase(timeHorizonValue)
      : "Intraday to 1-3 trading days";

  if (
    addExposureConditions.length === 0 ||
    reduceExposureConditions.length === 0 ||
    noTradeZones.length === 0
  ) {
    const missing: string[] = [];
    if (addExposureConditions.length === 0) missing.push("addExposureConditions");
    if (reduceExposureConditions.length === 0) missing.push("reduceExposureConditions");
    if (noTradeZones.length === 0) missing.push("noTradeZones");
    throw new Error(
      `Missing required position wording arrays: ${missing.join(", ")} | ${summarizePayloadForError(raw)}`,
    );
  }

  return {
    currentBias,
    addExposureConditions,
    reduceExposureConditions,
    noTradeZones,
    timeHorizon,
    status: "complete",
  };
}

export async function buildPositionWording(
  context: { regime: RegimeAssessment; outlook: OutlookDistribution },
  options: PositionWordingServiceOptions = {},
): Promise<PositionWordingBlock> {
  if (options.skillExecution) {
    try {
      const raw = await options.skillExecution.execute(context);
      return normalizeLlmPositionOutput(raw);
    } catch (error) {
      options.onLlmError?.(error);
      return {
        status: "omitted_llm_failure",
      };
    }
  }

  if (options.llmBinding) {
    try {
      return normalizeLlmPositionOutput(await options.llmBinding(context));
    } catch (error) {
      options.onLlmError?.(error);
      return {
        status: "omitted_llm_failure",
      };
    }
  }

  const constructive = context.regime.label === "risk_on" || context.outlook.primaryScenario === "bull";
  return {
    currentBias: constructive ? "Measured risk-on bias" : "Measured defensive bias",
    addExposureConditions: [
      "Add only if breadth improves and momentum remains consistent across the watchlist.",
      "Require confirmation from follow-through after macro/event headlines.",
    ],
    reduceExposureConditions: [
      "Reduce if leading instruments lose intraday support and close below recent range midpoints.",
      "Reduce on adverse policy/liquidity surprise.",
    ],
    noTradeZones: [
      "Avoid chasing immediately after outsized gap moves without confirmation.",
      "Avoid low-liquidity sessions around major scheduled events.",
    ],
    timeHorizon: "Intraday to 1-3 trading days",
    status: "complete",
  };
}
