import { describe, expect, it } from "vitest";

import { renderMarketReportMarkdown } from "../../../src/report/markdown-renderer";

describe("markdown renderer", () => {
  it("renders required sections in order with metadata", () => {
    const markdown = renderMarketReportMarkdown({
      generatedAt: "2026-02-23T08:15:00.000Z",
      status: "complete",
      triggerType: "manual",
      dataSources: ["RSS", "CoinGecko", "FRED"],
      newsItems: [],
      marketSnapshot: [],
      macroContext: [],
      regime: {
        label: "transition",
        dispersionSignal: "d",
        correlationSignal: "c",
        momentumSignal: "m",
        macroSignal: "macro",
        macroContext: [],
        rationale: "r",
      },
      sentiment: {
        score: 0,
        method: "deterministic",
        narrativeSummary: "n",
        priceActionCoherence: "p",
        status: "complete",
      },
      topArticlesToRead: {
        method: "llm_chunked",
        totalNewsEvaluated: 742,
        candidateNewsEvaluated: 200,
        items: [
          {
            rank: 1,
            title: "ETF flow regime shifts as BTC volatility compresses",
            source: "Example",
            publishedAt: "2026-02-23T07:00:00.000Z",
            link: "https://example.com/top-article",
            category: "crypto",
            relevanceScore: 8.9,
            sentimentImpact: "high",
            marketImpact: "high",
            investorBehaviorImpact: "high",
            timeHorizon: "intraday to 2 days",
            rationale: "Flow and positioning implications can quickly alter sentiment and near-term price behavior.",
            articleSummary:
              "BTC volatility compressed while ETF flow expectations improved, making this headline relevant for near-term sentiment and positioning shifts.",
          },
        ],
        notes: ["LLM evaluated a prefiltered candidate pool (200) from 742 extracted articles."],
      },
      outlook: {
        bullPct: 30,
        basePct: 40,
        bearPct: 30,
        primaryScenario: "base",
        justification: "j",
        constraintValidated: true,
      },
      riskInvalidation: {
        invalidationConditions: ["a"],
        keyPriceThresholds: ["b"],
        criticalMacroEvents: ["c"],
      },
      positionWording: {
        currentBias: "Measured risk-on bias",
        addExposureConditions: ["x"],
        reduceExposureConditions: ["y"],
        noTradeZones: ["z"],
        timeHorizon: "1-3 days",
        status: "complete",
      },
    });

    const expectedHeadings = [
      "## 0. Metadata",
      "## 1. Executive Summary",
      "## 2. Market Regime & Position Wording",
      "## 3. Risk & Invalidation / Sentiment Score",
      "## 4. Tactical Positioning & Probabilistic Outlook",
      "## 5. Macro Dashboard",
      "## 6. Crypto Dashboard",
      "## 7. Flow & ETF Data",
      "## 8. Top 20 News (scored + classified)",
      "## 9. Sources & References",
    ];

    let cursor = -1;
    for (const heading of expectedHeadings) {
      const index = markdown.indexOf(heading);
      expect(index).toBeGreaterThan(cursor);
      cursor = index;
    }

    expect(markdown).toContain("generation timestamp");
    expect(markdown).toContain("report status: complete");
    expect(markdown).toContain("trigger type: manual");
    expect(markdown).toContain("data source summary: RSS, CoinGecko, FRED");
    expect(markdown).toContain("## 7. Flow & ETF Data");
    expect(markdown).toContain("No ETF flow data available.");
    expect(markdown).toContain("Method: llm_chunked");
    expect(markdown).not.toContain("| Rank | Source | Date | Article |");
    expect(markdown).toContain("---");
    expect(markdown).toContain("[ETF flow regime shifts as BTC volatility compresses](<https://example.com/top-article>)");
    expect(markdown).toContain(
      "[Relevance: 8.9/10 | Sentiment: high | Market: high | Horizon: intraday to 2 days]",
    );
    expect(markdown).toContain("Behavior: high");
    expect(markdown).toContain("Source: Example");
    expect(markdown).toContain("Date: 2026-02-23");
    expect(markdown).toContain("Summary:");
    expect(markdown).toContain(
      "BTC volatility compressed while ETF flow expectations improved, making this headline relevant for near-term sentiment and positioning shifts.",
    );
    expect(markdown).toContain("Why read:");
    expect(markdown).toContain(
      "Flow and positioning implications can quickly alter sentiment and near-term price behavior.",
    );
  });

  it("renders incomplete metadata and omission reasons", () => {
    const markdown = renderMarketReportMarkdown({
      generatedAt: "2026-02-23T08:15:00.000Z",
      status: "incomplete",
      triggerType: "manual",
      dataSources: ["RSS", "CoinGecko", "FRED"],
      omissionReasons: ["LLM timeout"],
      newsItems: [],
      marketSnapshot: [],
      macroContext: [],
      regime: {
        label: "transition",
        dispersionSignal: "d",
        correlationSignal: "c",
        momentumSignal: "m",
        macroSignal: "macro",
        macroContext: [],
        rationale: "r",
      },
      sentiment: {
        method: "llm_assisted",
        priceActionCoherence: "n/a",
        status: "omitted_llm_failure",
      },
      outlook: {
        bullPct: 30,
        basePct: 40,
        bearPct: 30,
        primaryScenario: "base",
        justification: "j",
        constraintValidated: true,
      },
      riskInvalidation: {
        invalidationConditions: ["a"],
        keyPriceThresholds: ["b"],
        criticalMacroEvents: ["c"],
      },
      positionWording: {
        status: "omitted_llm_failure",
      },
    });

    expect(markdown).toContain("report status: incomplete");
    expect(markdown).toContain("omission reasons: LLM timeout");
    expect(markdown).toContain("Section omitted");
  });

  it("renders long complete reports without truncating them", () => {
    const longText = Array.from({ length: 1400 }, (_, i) => `word${i}`).join(" ");
    const markdown = renderMarketReportMarkdown({
      generatedAt: "2026-02-23T08:15:00.000Z",
      status: "complete",
      triggerType: "manual",
      dataSources: ["RSS", "CoinGecko", "FRED"],
      newsItems: [],
      marketSnapshot: [],
      macroContext: [],
      regime: {
        label: "transition",
        dispersionSignal: longText,
        correlationSignal: "c",
        momentumSignal: "m",
        macroSignal: "macro",
        macroContext: [],
        rationale: "r",
      },
      sentiment: {
        score: 0,
        method: "deterministic",
        narrativeSummary: "n",
        priceActionCoherence: "p",
        status: "complete",
      },
      outlook: {
        bullPct: 30,
        basePct: 40,
        bearPct: 30,
        primaryScenario: "base",
        justification: "j",
        constraintValidated: true,
      },
      riskInvalidation: {
        invalidationConditions: ["a"],
        keyPriceThresholds: ["b"],
        criticalMacroEvents: ["c"],
      },
      positionWording: {
        currentBias: "Measured risk-on bias",
        addExposureConditions: ["x"],
        reduceExposureConditions: ["y"],
        noTradeZones: ["z"],
        timeHorizon: "1-3 days",
        status: "complete",
      },
    });

    expect(markdown).toContain("\n## 0. Metadata\n");
    expect(markdown).toContain("\n## 9. Sources & References\n");
    expect(markdown.split("\n").length).toBeGreaterThan(5);
    expect(markdown).toContain(longText);
    expect(markdown.trimEnd().endsWith("…")).toBe(false);
  });
});
