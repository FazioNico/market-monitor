import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseCoinGeckoMarketsJson } from "../../../src/market/coingecko-client";

describe("coingecko client parsing", () => {
  it("maps fixture JSON into market snapshot items for watchlist instruments", async () => {
    const fixture = await readFile(
      join(process.cwd(), "tests", "fixtures", "coingecko", "simple-price.json"),
      "utf8",
    );

    const snapshots = parseCoinGeckoMarketsJson(fixture, [
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
    ]);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      instrumentId: "btc-usd",
      provider: "coingecko",
      currency: "usd",
    });
    expect(snapshots[0]!.currentPrice).toBeCloseTo(98250.12, 2);
  });
});
