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

  it("accepts snake_case keys and string score values", async () => {
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
            score: "0.85",
            narrative_summary: "Measured constructive setup",
            price_action_coherence: "Headline tone aligns with stabilization",
          }) as any,
      },
    );

    expect(sentiment.status).toBe("complete");
    expect(sentiment.score).toBe(0.85);
    expect(sentiment.narrativeSummary).toContain("Measured constructive setup");
    expect(sentiment.priceActionCoherence).toContain("aligns");
  });

  it("accepts wrapped sentiment payloads", async () => {
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
            sentiment_assessment: {
              sentiment_score: 0.4,
              summary: "Measured neutral-to-constructive bias",
              coherence: "Price action and headlines are broadly consistent",
            },
          }) as any,
      },
    );

    expect(sentiment.status).toBe("complete");
    expect(sentiment.score).toBe(0.4);
    expect(sentiment.narrativeSummary).toContain("Measured neutral");
    expect(sentiment.priceActionCoherence).toContain("broadly consistent");
  });
});
