import { describe, expect, it } from "vitest";

import { buildNewsReadingPriorityList } from "../../../src/analysis/news-reading-priority";
import type { MarketSnapshotItem, NewsItem, RegimeAssessment, SentimentAssessment } from "../../../src/shared/types";

function makeNewsItem(index: number, overrides: Partial<NewsItem> = {}): NewsItem {
  const baseDate = new Date(Date.UTC(2026, 1, 23, 12, 0, 0) - index * 60 * 60 * 1000).toISOString();
  return {
    title: `Article ${index} market update`,
    publishedAt: baseDate,
    source: "ExampleWire",
    summary: "General market update and investor positioning notes.",
    link: `https://example.com/article-${index}`,
    category: "crypto",
    ingestedAt: baseDate,
    fingerprint: `fp-${index}`,
    ...overrides,
  };
}

function baseRegime(): RegimeAssessment {
  return {
    label: "transition",
    dispersionSignal: "mixed",
    correlationSignal: "elevated",
    momentumSignal: "slowing",
    macroSignal: "neutral",
    macroContext: [],
    rationale: "Mixed signals",
  };
}

function baseSentiment(): SentimentAssessment {
  return {
    score: 0.4,
    method: "deterministic",
    narrativeSummary: "Measured constructive tone",
    priceActionCoherence: "Headlines broadly align with stabilization",
    status: "complete",
  };
}

function baseMarketSnapshot(): MarketSnapshotItem[] {
  return [
    {
      instrumentId: "btc-usd",
      capturedAt: "2026-02-23T12:00:00.000Z",
      currentPrice: 65000,
      return24hPct: 2.1,
      return7dPct: 4.4,
      volume24h: 1_000_000,
      currency: "usd",
      provider: "coingecko",
    },
  ];
}

describe("news reading priority service", () => {
  it("returns a deterministic top-20 fallback when no LLM is configured", async () => {
    const newsItems = Array.from({ length: 35 }, (_, i) =>
      makeNewsItem(i, {
        title:
          i % 4 === 0
            ? `Fed policy outlook and BTC ETF inflows update ${i}`
            : `Generic market wrap ${i}`,
        summary:
          i % 4 === 0
            ? "Policy rates, ETF inflows and leverage positioning may shift crypto sentiment."
            : "Daily recap of price changes.",
      }),
    );

    const result = await buildNewsReadingPriorityList(
      {
        newsItems,
        marketSnapshot: baseMarketSnapshot(),
        regime: baseRegime(),
        sentiment: baseSentiment(),
      },
      { now: new Date("2026-02-23T12:00:00.000Z") },
    );

    expect(result.method).toBe("deterministic");
    expect(result.items).toHaveLength(20);
    expect(result.totalNewsEvaluated).toBe(35);
    expect(result.candidateNewsEvaluated).toBe(35);
    expect(result.notes?.join(" ")).toContain("LLM ranking unavailable");
    expect(result.items[0]?.relevanceScore).toBeGreaterThanOrEqual(result.items[19]?.relevanceScore ?? 0);
  });

  it("parses LLM output and maps candidate identifiers to prioritized articles", async () => {
    const newsItems = [
      makeNewsItem(0, {
        title: "Fed signals liquidity support as Treasury yields fall",
        summary: "Potential cross-asset risk-on repricing and sentiment shift.",
      }),
      makeNewsItem(1, {
        title: "BTC ETF inflows accelerate after volatility compression",
        summary: "Flows and positioning can influence investor behavior in the near term.",
      }),
      makeNewsItem(2, {
        title: "Daily market wrap: prices mixed",
        summary: "Generic recap",
      }),
    ];

    const result = await buildNewsReadingPriorityList(
      {
        newsItems,
        marketSnapshot: baseMarketSnapshot(),
        regime: baseRegime(),
        sentiment: baseSentiment(),
      },
      {
        now: new Date("2026-02-23T12:00:00.000Z"),
        llmInvoke: async (prompt) => {
          const context = prompt.context as {
            candidates: Array<{ candidate_id: string }>;
          };
          const [first, second] = context.candidates;
          return {
            top_articles: [
              {
                candidate_id: second?.candidate_id,
                rank: 2,
                relevance_score: 8.4,
                sentiment_impact: "high",
                market_impact: "medium",
                investor_behavior_impact: "high",
                time_horizon: "intraday to 3 days",
                why_read: "Amazing signal for investor positioning!!!",
              },
              {
                candidate_id: first?.candidate_id,
                rank: 1,
                relevance_score: 9.1,
                sentiment_impact: "high",
                market_impact: "high",
                investor_behavior_impact: "medium",
                time_horizon: "intraday",
                why_read: "Policy/liquidity headline can reprice risk assets quickly.",
              },
            ],
          };
        },
      },
    );

    expect(result.method).toBe("llm_single_pass");
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    expect(result.items[0]?.rank).toBe(1);
    expect(result.items[0]?.relevanceScore).toBe(9.1);
    expect(result.items[1]?.rationale).not.toMatch(/Amazing|!/i);
  });

  it("falls back to deterministic ranking when LLM ranking fails", async () => {
    const newsItems = Array.from({ length: 80 }, (_, i) =>
      makeNewsItem(i, {
        title: i % 2 === 0 ? `SEC ETF decision and BTC flows ${i}` : `Market recap ${i}`,
        summary: i % 2 === 0 ? "Regulatory and flow-driven move with sentiment impact." : "Recap.",
      }),
    );

    const errors: unknown[] = [];
    const result = await buildNewsReadingPriorityList(
      {
        newsItems,
        marketSnapshot: baseMarketSnapshot(),
        regime: baseRegime(),
        sentiment: baseSentiment(),
      },
      {
        now: new Date("2026-02-23T12:00:00.000Z"),
        llmInvoke: async () => {
          throw new Error("LLM timeout");
        },
        onLlmError: (error) => {
          errors.push(error);
        },
      },
    );

    expect(errors).toHaveLength(1);
    expect(result.method).toBe("deterministic");
    expect(result.items).toHaveLength(20);
    expect(result.notes?.join(" ")).toContain("LLM ranking failed");
  });
});
