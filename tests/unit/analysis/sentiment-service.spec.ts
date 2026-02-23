import { describe, expect, it } from "vitest";

import { generateSentimentAssessment } from "../../../src/analysis/sentiment-service";

describe("sentiment service (deterministic)", () => {
  it("produces a complete deterministic sentiment assessment within [-2,2]", async () => {
    const sentiment = await generateSentimentAssessment({
      newsItems: [
        {
          title: "Bitcoin rebounds after overnight selloff",
          publishedAt: "2026-02-23T08:15:00.000Z",
          source: "Sample",
          summary: "Sample",
          link: "https://example.com/x",
          category: "crypto",
          ingestedAt: "2026-02-23T08:20:00.000Z",
          fingerprint: "abc",
        },
      ],
      marketSnapshot: [
        {
          instrumentId: "btc-usd",
          capturedAt: "2026-02-23T08:00:00.000Z",
          currentPrice: 100,
          return24hPct: 1.5,
          return7dPct: -1,
          currency: "usd",
          provider: "coingecko",
        },
      ],
      regime: {
        label: "transition",
        dispersionSignal: "",
        correlationSignal: "",
        momentumSignal: "",
        macroSignal: "",
        macroContext: [],
        rationale: "",
      },
    });

    expect(sentiment.status).toBe("complete");
    expect(sentiment.method).toBe("deterministic");
    expect(sentiment.score!).toBeGreaterThanOrEqual(-2);
    expect(sentiment.score!).toBeLessThanOrEqual(2);
  });
});
