import type { NewsItem, MarketSnapshotItem, RegimeAssessment } from "../../shared/types";

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
): Promise<unknown> {
  if (!deps.invoke) {
    throw new Error("LLM invoke not configured");
  }
  const raw = await deps.invoke({
    skillDescription: [
      input.skillDescription,
      "",
      "Output contract (strict): return a top-level JSON object only, with these keys:",
      '- "score": number in [-2, 2]',
      '- "narrative_summary" (or "narrativeSummary"): string',
      '- "price_action_coherence" (or "priceActionCoherence"): string',
      "No wrapper object. No markdown. No prose outside JSON.",
      "",
      "Example:",
      JSON.stringify(
        {
          score: 0.6,
          narrative_summary: "Measured sentiment is moderately constructive with mixed but improving evidence.",
          price_action_coherence: "Headline tone broadly aligns with recent price stabilization and follow-through.",
        },
        null,
        2,
      ),
    ].join("\n"),
    context: {
      newsItems: input.newsItems.slice(0, 8),
      marketSnapshot: input.marketSnapshot,
      regime: input.regime,
    },
  });
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as any) : (raw as any);
  // Return raw payload so the sentiment service can apply tolerant parsing and validation.
  return parsed;
}
