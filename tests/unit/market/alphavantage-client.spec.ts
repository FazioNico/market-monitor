import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseAlphaVantageDailySeriesJson } from "../../../src/market/alphavantage-client";

describe("alphavantage client parsing", () => {
  it("maps fixture JSON into a market snapshot item for index watchlist instruments", async () => {
    const fixture = await readFile(
      join(process.cwd(), "tests", "fixtures", "alphavantage", "daily-time-series.json"),
      "utf8",
    );

    const snapshot = parseAlphaVantageDailySeriesJson({
      json: fixture,
      instrument: {
        id: "spy-usd",
        symbol: "SPY",
        name: "SPDR S&P 500 ETF Trust",
        assetClass: "index",
        provider: "alphavantage",
        providerKey: "SPY",
        volumeRelevant: true,
        enabled: true,
      },
    });

    expect(snapshot).toMatchObject({
      instrumentId: "spy-usd",
      provider: "alphavantage",
      currency: "usd",
      volume24h: 70234567,
    });
    expect(snapshot.currentPrice).toBeCloseTo(611.25, 2);
    expect(snapshot.return24hPct).toBeCloseTo(0.52, 2);
    expect(snapshot.return7dPct).toBeCloseTo(3.16, 2);
  });
});
