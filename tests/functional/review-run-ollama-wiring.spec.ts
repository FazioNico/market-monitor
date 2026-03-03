import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runReviewCommand } from "../../src/cli/commands/run-review";
import { readRunLogEntries } from "../../src/runtime/run-log";
import { createTempWorkspace } from "../helpers/temp-workspace";

async function readFixture(relativePath: string): Promise<string> {
  return readFile(join(process.cwd(), "tests", "fixtures", relativePath), "utf8");
}

describe("review run ollama wiring (functional)", () => {
  it("uses env-configured Ollama client and avoids LLM omission when /api/chat returns valid JSON", async () => {
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

      const rootSkills = [
        ["sentiment", "sentiment-news-price-coherence-v1.md"],
        ["outlook", "outlook-validation-v1.md"],
        ["positioning", "position-wording-v1.md"],
      ] as const;
      for (const [dir, file] of rootSkills) {
        const contents = await readFile(join(process.cwd(), "skills", dir, file), "utf8");
        await writeFile(workspace.path("skills", dir, file), contents, "utf8");
      }

      const rssXml = await readFixture("rss/sample-feed.xml");
      const coingeckoJson = await readFixture("coingecko/simple-price.json");
      const fredJson = await readFixture("fred/series-observations.json");
      const ollamaCalls: any[] = [];

      const fetchFn: typeof fetch = (async (input, init) => {
        const url = String(input);
        if (url.includes("example.com/crypto/rss.xml")) return new Response(rssXml, { status: 200 });
        if (url.includes("api.coingecko.com")) return new Response(coingeckoJson, { status: 200 });
        if (url.includes("api.stlouisfed.org")) return new Response(fredJson, { status: 200 });
        if (url === "http://localhost:11434/api/chat") {
          const body = JSON.parse(String(init?.body ?? "{}"));
          ollamaCalls.push(body);
          return new Response(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  score: 0.7,
                  narrativeSummary: "Measured summary",
                  priceActionCoherence: "Measured coherence",
                  currentBias: "Measured risk-on bias",
                  addExposureConditions: ["Add on confirmation"],
                  reduceExposureConditions: ["Reduce on breakdown"],
                  noTradeZones: ["Avoid low liquidity spikes"],
                  timeHorizon: "Intraday to 1-3 days",
                }),
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }) as typeof fetch;

      const exitCode = await runReviewCommand({
        cwd: workspace.root,
        env: {
          REPORTS_DIR: "reports",
          RUN_LOG_PATH: "logs/runs.jsonl",
          FRED_API_KEY: "x",
          LLM_BASE_URL: "http://localhost:11434",
          LLM_MODEL: "llama3.1",
        },
        fetchFn,
        argv: ["--date", "2026-02-23"],
        logger: { log: () => {}, error: () => {} },
      });

      expect(exitCode).toBe(0);
      expect(ollamaCalls.length).toBeGreaterThanOrEqual(2);

      const reports = (await readdir(workspace.path("reports"))).filter((x) => x.endsWith(".md"));
      const markdown = await readFile(workspace.path("reports", reports[0]!), "utf8");
      expect(markdown).toContain("report status: complete");
      expect(markdown).not.toContain("omission reasons:");

      const entries = await readRunLogEntries(workspace.path("logs", "runs.jsonl"));
      expect(entries.some((entry) => entry.status === "success")).toBe(true);
      expect(entries.some((entry) => entry.status === "partial_success")).toBe(false);
    } finally {
      await workspace.cleanup();
    }
  });
});
