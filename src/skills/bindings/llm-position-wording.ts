import type { OutlookDistribution, PositionWordingBlock, RegimeAssessment } from "../../shared/types";

export interface LlmPositionWordingBindingDependencies {
  invoke?: (prompt: { skillDescription: string; context: unknown }) => Promise<unknown>;
}

export async function llmPositionWordingBinding(
  input: {
    skillDescription: string;
    regime: RegimeAssessment;
    outlook: OutlookDistribution;
  },
  deps: LlmPositionWordingBindingDependencies = {},
): Promise<PositionWordingBlock> {
  if (!deps.invoke) {
    throw new Error("LLM invoke not configured");
  }
  const raw = await deps.invoke({
    skillDescription: input.skillDescription,
    context: {
      regime: input.regime,
      outlook: input.outlook,
    },
  });
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as any) : (raw as any);

  return {
    currentBias: typeof parsed.currentBias === "string" ? parsed.currentBias : "Measured neutral bias",
    addExposureConditions: Array.isArray(parsed.addExposureConditions) ? parsed.addExposureConditions : [],
    reduceExposureConditions: Array.isArray(parsed.reduceExposureConditions) ? parsed.reduceExposureConditions : [],
    noTradeZones: Array.isArray(parsed.noTradeZones) ? parsed.noTradeZones : [],
    timeHorizon: typeof parsed.timeHorizon === "string" ? parsed.timeHorizon : "Intraday to 1-3 days",
    status: "complete",
  };
}
