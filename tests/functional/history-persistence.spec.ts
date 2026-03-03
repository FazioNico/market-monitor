import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runReviewCommand } from "../../src/cli/commands/run-review";
import { readRunLogEntries } from "../../src/runtime/run-log";
import { createTempWorkspace } from "../helpers/temp-workspace";

async function readFixture(relativePath: string): Promise<string> {
  return readFile(join(process.cwd(), "tests", "fixtures", relativePath), "utf8");
}

describe("history persistence (functional)", () => {
  it("preserves many sequential reports and append-only run logs", async () => {
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

      for (let day = 1; day <= 30; day += 1) {
        const date = `2026-01-${String(day).padStart(2, "0")}`;
        const code = await runReviewCommand({
          cwd: workspace.root,
          env: { RUN_LOG_PATH: "logs/runs.jsonl", REPORTS_DIR: "reports", FRED_API_KEY: "x" },
          fetchFn,
          argv: ["--date", date],
          logger: { log: () => {}, error: () => {} },
        });
        expect(code).toBe(0);
      }

      const reports = (await readdir(workspace.path("reports"))).filter((x) => x.endsWith(".md"));
      expect(reports.length).toBe(30);
      const logs = await readRunLogEntries(workspace.path("logs", "runs.jsonl"));
      expect(logs.filter((entry) => entry.status === "success").length).toBe(30);
    } finally {
      await workspace.cleanup();
    }
  });
});
