import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runReviewCommand } from "../../src/cli/commands/run-review";
import { readRunLogEntries } from "../../src/runtime/run-log";
import { createTempWorkspace } from "../helpers/temp-workspace";

async function readFixture(relativePath: string): Promise<string> {
  return readFile(join(process.cwd(), "tests", "fixtures", relativePath), "utf8");
}

describe("review run (functional)", () => {
  it("generates one markdown report with required sections and a run-log entry", async () => {
    const workspace = await createTempWorkspace();

    try {
      await mkdir(workspace.path("config"), { recursive: true });
      await mkdir(workspace.path("reports"), { recursive: true });
      await mkdir(workspace.path("logs"), { recursive: true });
      await mkdir(workspace.path("skills", "sentiment"), { recursive: true });
      await mkdir(workspace.path("skills", "outlook"), { recursive: true });
      await mkdir(workspace.path("skills", "positioning"), { recursive: true });

      await writeFile(
        workspace.path("config", "rss-feeds.md"),
        `---
default_lookback_hours: 48
---

| category | source | url | enabled | notes |
|---|---|---|---|---|
| crypto | Example | https://example.com/crypto/rss.xml | true | fixture feed |
`,
        "utf8",
      );

      await writeFile(
        workspace.path("config", "watchlist.json"),
        JSON.stringify(
          [
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
          ],
          null,
          2,
        ),
        "utf8",
      );

      const rssXml = await readFixture("rss/sample-feed.xml");
      const coingeckoJson = await readFixture("coingecko/simple-price.json");
      const fredJson = await readFixture("fred/series-observations.json");

      const fetchFn: typeof fetch = (async (input) => {
        const url = String(input);
        if (url.includes("example.com/crypto/rss.xml")) {
          return new Response(rssXml, { status: 200, headers: { "content-type": "application/xml" } });
        }
        if (url.includes("api.coingecko.com")) {
          return new Response(coingeckoJson, { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("api.stlouisfed.org")) {
          return new Response(fredJson, { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response("not found", { status: 404 });
      }) as typeof fetch;

      const exitCode = await runReviewCommand({
        cwd: workspace.root,
        env: {
          REPORTS_DIR: "reports",
          RUN_LOG_PATH: "logs/runs.jsonl",
          FRED_API_KEY: "test-key",
        },
        fetchFn,
        argv: ["--trigger", "manual", "--date", "2026-02-23"],
        logger: { log: () => {}, error: () => {} },
      });

      expect(exitCode).toBe(0);

      const reports = (await readdir(workspace.path("reports"))).filter((file) => file.endsWith(".md"));
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}_market-report\.md$/);

      const markdown = await readFile(workspace.path("reports", reports[0]!), "utf8");
      expect(markdown).toContain("## Market Snapshot");
      expect(markdown).toContain("## Regime Detection");
      expect(markdown).toContain("## Probabilistic Outlook");
      expect(markdown).toContain("## Risk & Invalidation");
      expect(markdown).toContain("## Position Wording");
      expect(markdown).toContain("CPI=");

      const entries = await readRunLogEntries(workspace.path("logs", "runs.jsonl"));
      expect(entries.some((entry) => entry.status === "success")).toBe(true);
    } finally {
      await workspace.cleanup();
    }
  });
});
