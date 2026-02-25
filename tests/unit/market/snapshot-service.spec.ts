import { describe, expect, it } from "vitest";

import { buildMarketSnapshot } from "../../../src/market/snapshot-service";

describe("snapshot service", () => {
  it("combines snapshots returned by coingecko and hyperliquid providers", async () => {
    const snapshots = await buildMarketSnapshot(
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
        {
          id: "gold-usdc",
          symbol: "GOLD",
          name: "Gold",
          assetClass: "commodity",
          provider: "hyperliquid",
          providerKey: "GOLD-USDC",
          volumeRelevant: true,
          enabled: true,
        },
      ],
      {
        coingecko: {
          fetchMarketSnapshots: async () => [{
            instrumentId: "btc-usd",
            capturedAt: "2026-02-23T08:10:00.000Z",
            currentPrice: 100,
            return24hPct: 1,
            return7dPct: 2,
            currency: "usd",
            provider: "coingecko",
          }],
        },
        hyperliquid: {
          fetchMarketSnapshots: async () => [{
            instrumentId: "gold-usdc",
            capturedAt: "2026-02-23T08:10:00.000Z",
            currentPrice: 2900,
            return24hPct: 0.5,
            return7dPct: 0,
            currency: "usdc",
            provider: "hyperliquid",
          }],
        },
      } as any,
    );

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.instrumentId).toBe("btc-usd");
    expect(snapshots[1]?.instrumentId).toBe("gold-usdc");
  });
});
