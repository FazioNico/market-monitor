import { describe, expect, it } from "vitest";

import { enrichTopArticlesWithContentSummaries } from "../../../src/analysis/top-article-content-summary";
import type { NewsItem, NewsReadingPriorityList } from "../../../src/shared/types";

function makeNewsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    title: "Bitcoin rebounds after overnight selloff",
    publishedAt: "2026-02-23T08:15:00.000Z",
    source: "Example",
    summary: "Risk assets stabilized in European trading.",
    link: "https://example.com/articles/bitcoin-rebounds",
    category: "crypto",
    ingestedAt: "2026-02-23T08:16:00.000Z",
    fingerprint: "fp_1",
    ...overrides,
  };
}

function makePriorityList(): NewsReadingPriorityList {
  return {
    method: "deterministic",
    totalNewsEvaluated: 2,
    candidateNewsEvaluated: 2,
    items: [
      {
        rank: 1,
        title: "Bitcoin rebounds after overnight selloff",
        source: "Example",
        publishedAt: "2026-02-23T08:15:00.000Z",
        link: "https://example.com/articles/bitcoin-rebounds",
        category: "crypto",
        relevanceScore: 8.1,
        sentimentImpact: "high",
        marketImpact: "high",
        investorBehaviorImpact: "medium",
        timeHorizon: "intraday to 2 days",
        rationale: "Volatility and flow dynamics can shift sentiment quickly.",
      },
      {
        rank: 2,
        title: "Macro recap and rate expectations",
        source: "Example",
        publishedAt: "2026-02-23T07:10:00.000Z",
        link: "https://example.com/articles/macro-recap",
        category: "macro",
        relevanceScore: 6.4,
        sentimentImpact: "medium",
        marketImpact: "medium",
        investorBehaviorImpact: "low",
        timeHorizon: "1-3 days",
        rationale: "Context for rate-sensitive repricing.",
      },
    ],
  };
}

describe("top article content summary enrichment", () => {
  it("uses LLM summaries from article content and falls back to RSS summaries on fetch failure", async () => {
    const newsItems: NewsItem[] = [
      makeNewsItem(),
      makeNewsItem({
        title: "Macro recap and rate expectations",
        summary: "Traders reassessed rate-cut odds after a stronger macro print.",
        link: "https://example.com/articles/macro-recap",
        category: "macro",
        fingerprint: "fp_2",
      }),
    ];

    const html = `
      <html>
        <head>
          <meta property="og:description" content="Short meta description fallback." />
        </head>
        <body>
          <article>
            <p>Bitcoin rebounded in European trading after overnight liquidations eased and ETF flow expectations improved across major desks.</p>
            <p>Analysts noted lower realized volatility and a better setup for short-term sentiment stabilization in risk assets.</p>
          </article>
        </body>
      </html>
    `;

    const fetchFn: typeof fetch = (async (input) => {
      const url = String(input);
      if (url.endsWith("/bitcoin-rebounds")) {
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const llmInvoke = async ({ context }: { skillDescription: string; context: unknown }) => {
      const article = (context as any)?.article;
      expect(article?.article_excerpt).toContain("Bitcoin rebounded in European trading");
      return {
        summary:
          "Liquidation pressure eased and ETF-flow expectations improved, supporting a near-term stabilization in crypto risk sentiment.",
      };
    };

    const result = await enrichTopArticlesWithContentSummaries(
      {
        topArticlesToRead: makePriorityList(),
        newsItems,
      },
      { fetchFn, llmInvoke, maxSummaryChars: 220 },
    );

    expect(result.topArticlesToRead.items).toHaveLength(2);
    expect(result.topArticlesToRead.items[0]?.articleSummary).toBe(
      "Liquidation pressure eased and ETF-flow expectations improved, supporting a near-term stabilization in crypto risk sentiment.",
    );
    expect(result.topArticlesToRead.items[1]?.articleSummary).toBe(
      "Traders reassessed rate-cut odds after a stronger macro print.",
    );

    expect(result.stats.total).toBe(2);
    expect(result.stats.fromArticleContent).toBe(1);
    expect(result.stats.fromRssFallback).toBe(1);
    expect(result.stats.unavailable).toBe(0);
    expect(result.stats.fetchErrors).toBe(1);
    expect(result.stats.llmSummaries).toBe(1);
    expect(result.stats.llmErrors).toBe(0);
  });
});
