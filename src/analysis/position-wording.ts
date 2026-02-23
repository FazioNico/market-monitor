import type { OutlookDistribution, PositionWordingBlock, RegimeAssessment, SkillDefinition } from "../shared/types";

export interface PositionWordingServiceOptions {
  llmBinding?: (context: { regime: RegimeAssessment; outlook: OutlookDistribution }) => Promise<PositionWordingBlock>;
  skillExecution?: {
    skill: SkillDefinition;
    execute(payload: { regime: RegimeAssessment; outlook: OutlookDistribution }): Promise<unknown>;
  };
}

function sanitizePhrase(value: string): string {
  return value
    .replace(/\b(amazing|panic|euphoric|guaranteed|certain)\b/gi, "measured")
    .replace(/!/g, ".")
    .trim();
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizePhrase(item))
    .filter((item) => item.length > 0);
}

function normalizeLlmPositionOutput(raw: unknown): PositionWordingBlock {
  const data = raw as Record<string, unknown>;
  const currentBias =
    typeof data.currentBias === "string" && data.currentBias.trim()
      ? sanitizePhrase(data.currentBias)
      : "Measured neutral bias";
  const addExposureConditions = normalizeStringArray(data.addExposureConditions);
  const reduceExposureConditions = normalizeStringArray(data.reduceExposureConditions);
  const noTradeZones = normalizeStringArray(data.noTradeZones);
  const timeHorizon =
    typeof data.timeHorizon === "string" && data.timeHorizon.trim()
      ? sanitizePhrase(data.timeHorizon)
      : "Intraday to 1-3 trading days";

  if (
    addExposureConditions.length === 0 ||
    reduceExposureConditions.length === 0 ||
    noTradeZones.length === 0
  ) {
    throw new Error("Missing required position wording arrays");
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
    } catch {
      return {
        status: "omitted_llm_failure",
      };
    }
  }

  if (options.llmBinding) {
    try {
      return normalizeLlmPositionOutput(await options.llmBinding(context));
    } catch {
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
