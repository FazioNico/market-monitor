import { describe, expect, it } from "vitest";

import { buildMarketSnapshot } from "../../../src/market/snapshot-service";

describe("snapshot service", () => {
  it("delegates to the coingecko provider and returns mapped snapshots", async () => {
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
      ],
      {
        coingecko: {
          fetchMarketSnapshots: async () => [
            {
              instrumentId: "btc-usd",
              capturedAt: "2026-02-23T08:10:00.000Z",
              currentPrice: 100,
              return24hPct: 1,
              return7dPct: 2,
              currency: "usd",
              provider: "coingecko",
            },
          ],
        },
      } as any,
    );

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.instrumentId).toBe("btc-usd");
  });
});
