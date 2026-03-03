import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createAlphaVantageClient } from "../../../src/market/alphavantage-client";

describe("alphavantage client edge cases", () => {
  it("skips invalid payloads instead of failing the full fetch", async () => {
    const validPayload = await readFile(
      join(process.cwd(), "tests", "fixtures", "alphavantage", "daily-time-series.json"),
      "utf8",
    );

    const client = createAlphaVantageClient({
      apiKey: "test-key",
      requestSpacingMs: 0,
      fetchFn: (async (input) => {
        const url = String(input);
        if (url.includes("symbol=SPY")) {
          return new Response(validPayload, { status: 200, headers: { "content-type": "application/json" } });
        }

        return new Response(JSON.stringify({ Note: "API call frequency exceeded." }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    const snapshots = await client.fetchMarketSnapshots([
      {
        id: "spy-usd",
        symbol: "SPY",
        name: "SPDR S&P 500 ETF Trust",
        assetClass: "index",
        provider: "alphavantage",
        providerKey: "SPY",
        volumeRelevant: true,
        enabled: true,
      },
      {
        id: "qqq-usd",
        symbol: "QQQ",
        name: "Invesco QQQ Trust",
        assetClass: "index",
        provider: "alphavantage",
        providerKey: "QQQ",
        volumeRelevant: true,
        enabled: true,
      },
    ]);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.instrumentId).toBe("spy-usd");
  });
});
