import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runReviewCommand } from "../../src/cli/commands/run-review";
import { readRunLogEntries } from "../../src/runtime/run-log";
import { createTempWorkspace } from "../helpers/temp-workspace";

async function readFixture(relativePath: string): Promise<string> {
  return readFile(join(process.cwd(), "tests", "fixtures", relativePath), "utf8");
}

describe("history failure preservation (functional)", () => {
  it("keeps prior report/log history when a later run fails", async () => {
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

      const successFetch: typeof fetch = (async (input) => {
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
          fetchFn: successFetch,
          argv: ["--date", "2026-02-20"],
          logger: { log: () => {}, error: () => {} },
        }),
      ).toBe(0);

      const failingFetch: typeof fetch = (async (input) => {
        const url = String(input);
        if (url.includes("example.com/crypto/rss.xml")) return new Response("bad", { status: 200 });
        return new Response("bad", { status: 500 });
      }) as typeof fetch;

      expect(
        await runReviewCommand({
          cwd: workspace.root,
          env: { RUN_LOG_PATH: "logs/runs.jsonl", REPORTS_DIR: "reports", FRED_API_KEY: "x" },
          fetchFn: failingFetch,
          argv: ["--date", "2026-02-21"],
          logger: { log: () => {}, error: () => {} },
        }),
      ).toBeGreaterThanOrEqual(1);

      const entries = await readRunLogEntries(workspace.path("logs", "runs.jsonl"));
      expect(entries.some((entry) => entry.status === "success")).toBe(true);
      expect(entries.some((entry) => entry.status === "failed")).toBe(true);
    } finally {
      await workspace.cleanup();
    }
  });
});
