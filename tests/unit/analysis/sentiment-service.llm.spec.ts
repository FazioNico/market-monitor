import { describe, expect, it } from "vitest";

import { generateSentimentAssessment } from "../../../src/analysis/sentiment-service";

describe("sentiment service (llm-assisted constraints)", () => {
  it("clamps score and sanitizes emotional wording", async () => {
    const sentiment = await generateSentimentAssessment(
      {
        newsItems: [],
        marketSnapshot: [],
        regime: {
          label: "transition",
          dispersionSignal: "",
          correlationSignal: "",
          momentumSignal: "",
          macroSignal: "",
          macroContext: [],
          rationale: "",
        },
      },
      {
        llmBinding: async () =>
          ({
            score: 9,
            method: "llm_assisted",
            narrativeSummary: "Amazing rally!!!",
            priceActionCoherence: "Panic then moonshot!",
            status: "complete",
          }) as any,
      },
    );

    expect(sentiment.status).toBe("complete");
    expect(sentiment.method).toBe("llm_assisted");
    expect(sentiment.score).toBe(2);
    expect(sentiment.narrativeSummary).not.toMatch(/Amazing|!/i);
    expect(sentiment.priceActionCoherence).not.toMatch(/Panic|moonshot|!/i);
  });
});
