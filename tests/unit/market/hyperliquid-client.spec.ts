import { describe, expect, it } from "vitest";

import {
  parseHyperliquidPerpMarketSnapshots,
  parseHyperliquidSpotMarketSnapshots,
} from "../../../src/market/hyperliquid-client";

describe("hyperliquid client parsing", () => {
  it("maps spotMetaAndAssetCtxs + allMids for configured commodity tickers", () => {
    const snapshots = parseHyperliquidSpotMarketSnapshots({
      allMids: {
        "@101": "2900",
        "@102": "32",
      },
      spotMetaAndAssetCtxs: [
        {
          universe: [
            { tokens: [10, 1], name: "@101" },
            { tokens: [11, 1], name: "@102" },
          ],
          tokens: [
            { index: 1, name: "USDC" },
            { index: 10, name: "GOLD" },
            { index: 11, name: "SILVER" },
          ],
        },
        [
          {
            coin: "@101",
            prevDayPx: "2880",
            dayNtlVlm: "123456.7",
            midPx: "2899.5",
            markPx: "2899.5",
          },
          {
            coin: "@102",
            prevDayPx: "31.5",
            dayNtlVlm: "654321.2",
            midPx: "32",
            markPx: "32",
          },
        ],
      ],
      watchlist: [
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
        {
          id: "silver-usdc",
          symbol: "SILVER",
          name: "Silver",
          assetClass: "commodity",
          provider: "hyperliquid",
          providerKey: "SILVER-USDC",
          volumeRelevant: true,
          enabled: true,
        },
      ],
      capturedAt: "2026-02-25T10:00:00.000Z",
    });

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({
      instrumentId: "gold-usdc",
      provider: "hyperliquid",
      currency: "usdc",
      currentPrice: 2900,
      return7dPct: 0,
      volume24h: 123456.7,
      capturedAt: "2026-02-25T10:00:00.000Z",
    });
    expect(snapshots[0]!.return24hPct).toBeCloseTo(((2900 - 2880) / 2880) * 100, 8);
    expect(snapshots[1]!.instrumentId).toBe("silver-usdc");
  });

  it("falls back to context mid/mark prices when allMids does not contain the spot pair key", () => {
    const snapshots = parseHyperliquidSpotMarketSnapshots({
      allMids: {},
      spotMetaAndAssetCtxs: [
        {
          universe: [{ tokens: [20, 1], name: "@201" }],
          tokens: [
            { index: 1, name: "USDC" },
            { index: 20, name: "COPPER" },
          ],
        },
        [
          {
            coin: "@201",
            prevDayPx: "4.2",
            dayNtlVlm: "40000",
            midPx: null,
            markPx: "4.25",
          },
        ],
      ],
      watchlist: [
        {
          id: "copper-usdc",
          symbol: "COPPER",
          name: "Copper",
          assetClass: "commodity",
          provider: "hyperliquid",
          providerKey: "COPPER-USDC",
          volumeRelevant: true,
          enabled: true,
        },
      ],
      capturedAt: "2026-02-25T10:00:00.000Z",
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.currentPrice).toBe(4.25);
    expect(snapshots[0]!.return24hPct).toBeCloseTo(((4.25 - 4.2) / 4.2) * 100, 8);
  });

  it("resolves spot asset contexts when ctx.coin is the base asset symbol (not the spot pair id)", () => {
    const snapshots = parseHyperliquidSpotMarketSnapshots({
      allMids: {
        GOLD: "2910",
      },
      spotMetaAndAssetCtxs: [
        {
          universe: [{ tokens: [30, 1], name: "@301" }],
          tokens: [
            { index: 1, name: "USDC" },
            { index: 30, name: "GOLD" },
          ],
        },
        [
          {
            coin: "GOLD",
            prevDayPx: "2900",
            dayNtlVlm: "123000",
            midPx: "2909.5",
            markPx: "2909.2",
          },
        ],
      ],
      watchlist: [
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
      capturedAt: "2026-02-25T10:00:00.000Z",
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      instrumentId: "gold-usdc",
      provider: "hyperliquid",
      currency: "usdc",
      currentPrice: 2910,
    });
  });

  it("maps builder dex perps from -USDC aliases (e.g. GOLD-USDC -> xyz:GOLD)", () => {
    const snapshots = parseHyperliquidPerpMarketSnapshots({
      allMids: {
        "xyz:GOLD": "5207.05",
        "xyz:SILVER": "90.913",
        "xyz:COPPER": "6.0466",
        "xyz:CL": "65.533",
      },
      metaAndAssetCtxs: [
        {
          universe: [
            { name: "xyz:GOLD" },
            { name: "xyz:SILVER" },
            { name: "xyz:COPPER" },
            { name: "xyz:CL" },
          ],
        },
        [
          { prevDayPx: "5166.3", dayNtlVlm: "62114454.44", midPx: "5207.05", markPx: "5206.8" },
          { prevDayPx: "88.026", dayNtlVlm: "802699272.07", midPx: "90.913", markPx: "90.911" },
          { prevDayPx: "5.9905", dayNtlVlm: "25127980.98", midPx: "6.0466", markPx: "6.0458" },
          { prevDayPx: "65.886", dayNtlVlm: "11140815.58", midPx: "65.533", markPx: "65.539" },
        ],
      ],
      watchlist: [
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
        {
          id: "silver-usdc",
          symbol: "SILVER",
          name: "Silver",
          assetClass: "commodity",
          provider: "hyperliquid",
          providerKey: "SILVER-USDC",
          volumeRelevant: true,
          enabled: true,
        },
        {
          id: "copper-usdc",
          symbol: "COPPER",
          name: "Copper",
          assetClass: "commodity",
          provider: "hyperliquid",
          providerKey: "COPPER-USDC",
          volumeRelevant: true,
          enabled: true,
        },
        {
          id: "oil-usdc",
          symbol: "OIL",
          name: "Crude Oil (CL)",
          assetClass: "commodity",
          provider: "hyperliquid",
          providerKey: "CL-USDC",
          volumeRelevant: true,
          enabled: true,
        },
      ],
      dex: "xyz",
      capturedAt: "2026-02-25T10:00:00.000Z",
    });

    expect(snapshots).toHaveLength(4);
    expect(snapshots.map((item) => item.instrumentId)).toEqual([
      "gold-usdc",
      "silver-usdc",
      "copper-usdc",
      "oil-usdc",
    ]);
    expect(snapshots.every((item) => item.provider === "hyperliquid")).toBe(true);
    expect(snapshots.every((item) => item.currency === "usdc")).toBe(true);
  });
});
