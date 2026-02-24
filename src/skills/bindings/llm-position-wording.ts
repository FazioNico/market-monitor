import type { OutlookDistribution, RegimeAssessment } from "../../shared/types";

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
): Promise<unknown> {
  if (!deps.invoke) {
    throw new Error("LLM invoke not configured");
  }
  const raw = await deps.invoke({
    skillDescription: [
      input.skillDescription,
      "",
      "Output contract (strict): return a top-level JSON object only, with these keys:",
      '- "current_bias": string',
      '- "add_exposure_conditions": string[] (at least 1 item)',
      '- "reduce_exposure_conditions": string[] (at least 1 item)',
      '- "no_trade_zones": string[] (at least 1 item)',
      '- "time_horizon": string',
      "No wrapper object. No markdown. No prose outside JSON.",
      "Use concise, non-emotional wording.",
      "",
      "Example:",
      JSON.stringify(
        {
          current_bias: "Measured risk-on bias",
          add_exposure_conditions: ["Add on confirmation of breadth and follow-through."],
          reduce_exposure_conditions: ["Reduce on failed breakout and loss of support."],
          no_trade_zones: ["Avoid low-liquidity spikes after large gaps."],
          time_horizon: "Intraday to 1-3 trading days",
        },
        null,
        2,
      ),
    ].join("\n"),
    context: {
      regime: input.regime,
      outlook: input.outlook,
    },
  });
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as any) : (raw as any);
  // Return raw parsed payload; downstream position-wording service handles tolerant parsing
  // (snake_case, wrappers, multiline strings) and enforces required structure.
  return parsed;
}
