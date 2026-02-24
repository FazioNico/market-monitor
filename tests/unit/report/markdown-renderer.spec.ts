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
      "## Report Metadata",
      "## Top 20 Articles to Read (Prioritized)",
      "## Market Snapshot",
      "## ETF Flows",
      "## Regime Detection",
      "## Sentiment Scoring",
      "## Probabilistic Outlook",
      "## Risk & Invalidation",
      "## Position Wording",
      "## Run Notes / Diagnostics",
      "## News Summary / RSS Ingestion Summary",
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
    expect(markdown).toContain("## ETF Flows");
    expect(markdown).toContain("No ETF flow data available.");
    expect(markdown).toContain("Method: llm_chunked");
    expect(markdown).toContain(
      "| Rank | Source | Date | Article | Article Summary | Relevance | Sentiment | Market | Behavior | Horizon | Why Read |",
    );
    expect(markdown).toContain(
      "| 1 | Example | 2026-02-23 | [ETF flow regime shifts as BTC volatility compresses](<https://example.com/top-article>) | BTC volatility compressed while ETF flow expectations improved, making this headline relevant for near-term sentiment and positioning shifts. | 8.9/10 | high | high | high | intraday to 2 days |",
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

    expect(markdown).toContain("\n## Report Metadata\n");
    expect(markdown).toContain("\n## News Summary / RSS Ingestion Summary\n");
    expect(markdown.split("\n").length).toBeGreaterThan(5);
    expect(markdown).toContain(longText);
    expect(markdown.trimEnd().endsWith("…")).toBe(false);
  });
});
