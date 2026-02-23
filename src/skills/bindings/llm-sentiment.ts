import type { NewsItem, MarketSnapshotItem, RegimeAssessment, SentimentAssessment } from "../../shared/types";

export interface LlmSentimentBindingDependencies {
  invoke?: (prompt: { skillDescription: string; context: unknown }) => Promise<unknown>;
}

export async function llmSentimentBinding(
  input: {
    skillDescription: string;
    newsItems: NewsItem[];
    marketSnapshot: MarketSnapshotItem[];
    regime: RegimeAssessment;
  },
  deps: LlmSentimentBindingDependencies = {},
): Promise<SentimentAssessment> {
  if (!deps.invoke) {
    throw new Error("LLM invoke not configured");
  }
  const raw = await deps.invoke({
    skillDescription: input.skillDescription,
    context: {
      newsItems: input.newsItems.slice(0, 8),
      marketSnapshot: input.marketSnapshot,
      regime: input.regime,
    },
  });
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as any) : (raw as any);

  return {
    score: typeof parsed.score === "number" ? parsed.score : 0,
    method: "llm_assisted",
    narrativeSummary:
      typeof parsed.narrativeSummary === "string"
        ? parsed.narrativeSummary
        : "LLM-assisted sentiment summary unavailable.",
    priceActionCoherence:
      typeof parsed.priceActionCoherence === "string"
        ? parsed.priceActionCoherence
        : "Coherence assessment unavailable.",
    status: "complete",
  };
}
