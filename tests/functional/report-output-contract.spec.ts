import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runReviewCommand } from "../../src/cli/commands/run-review";
import { createTempWorkspace } from "../helpers/temp-workspace";

async function readFixture(relativePath: string): Promise<string> {
  return readFile(join(process.cwd(), "tests", "fixtures", relativePath), "utf8");
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe("report output contract", () => {
  it("validates filename regex, section order, and readability proxy", async () => {
    const workspace = await createTempWorkspace();
    try {
      await mkdir(workspace.path("config"), { recursive: true });
      await mkdir(workspace.path("reports"), { recursive: true });
      await mkdir(workspace.path("logs"), { recursive: true });
      await writeFile(
        workspace.path("config", "rss-feeds.md"),
        `| category | source | url | enabled | notes |
|---|---|---|---|---|
| crypto | Example | https://example.com/crypto/rss.xml | true | fixture |
`,
      );
      await writeFile(
        workspace.path("config", "watchlist.json"),
        JSON.stringify([
          {
            id: "btc-usd",
            symbol: "BTC",
            name: "Bitcoin",
            assetClass: "crypto",
            provider: "coingecko",
            providerKey: "bitcoin",
            volumeRelevant: true,
            enabled: true,
          },
        ]),
      );

      const rssXml = await readFixture("rss/sample-feed.xml");
      const coingeckoJson = await readFixture("coingecko/simple-price.json");
      const fredJson = await readFixture("fred/series-observations.json");
      const fetchFn: typeof fetch = (async (input) => {
        const url = String(input);
        if (url.includes("example.com/crypto/rss.xml")) return new Response(rssXml, { status: 200 });
        if (url.includes("api.coingecko.com")) return new Response(coingeckoJson, { status: 200 });
        if (url.includes("api.stlouisfed.org")) return new Response(fredJson, { status: 200 });
        return new Response("not found", { status: 404 });
      }) as typeof fetch;

      expect(
        await runReviewCommand({
          cwd: workspace.root,
          env: { RUN_LOG_PATH: "logs/runs.jsonl", REPORTS_DIR: "reports", FRED_API_KEY: "x" },
          fetchFn,
          logger: { log: () => {}, error: () => {} },
        }),
      ).toBe(0);

      const reports = (await readdir(workspace.path("reports"))).filter((x) => x.endsWith(".md"));
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}_market-report\.md$/);

      const markdown = await readFile(workspace.path("reports", reports[0]!), "utf8");
      const headings = [
        "## Report Metadata",
        "## News Summary / RSS Ingestion Summary",
        "## Market Snapshot",
        "## Regime Detection",
        "## Sentiment Scoring",
        "## Probabilistic Outlook",
        "## Risk & Invalidation",
        "## Position Wording",
      ];
      let cursor = -1;
      for (const heading of headings) {
        const idx = markdown.indexOf(heading);
        expect(idx).toBeGreaterThan(cursor);
        cursor = idx;
      }
      expect(wordCount(markdown)).toBeLessThanOrEqual(1200);
    } finally {
      await workspace.cleanup();
    }
  });
});
