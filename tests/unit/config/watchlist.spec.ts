import { describe, expect, it } from "vitest";

import { ValidationError } from "../../../src/shared/errors";
import { parseWatchlistJson } from "../../../src/config/watchlist";

describe("watchlist parser", () => {
  it("parses valid instruments and defaults enabled=true when omitted", () => {
    const json = JSON.stringify([
      {
        id: "btc-usd",
        symbol: "BTC",
        name: "Bitcoin",
        assetClass: "crypto",
        provider: "coingecko",
        providerKey: "bitcoin",
        volumeRelevant: true,
      },
      {
        id: "eth-usd",
        symbol: "ETH",
        name: "Ethereum",
        assetClass: "crypto",
        provider: "coingecko",
        providerKey: "ethereum",
        volumeRelevant: true,
        enabled: false,
      },
    ]);

    const result = parseWatchlistJson(json);

    expect(result.allInstruments).toHaveLength(2);
    expect(result.instruments).toHaveLength(1);
    expect(result.allInstruments[0]?.enabled).toBe(true);
    expect(result.allInstruments[1]?.enabled).toBe(false);
  });

  it("rejects duplicate provider keys among enabled instruments for the same provider", () => {
    const json = JSON.stringify([
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
        id: "btc-duplicate",
        symbol: "BTC2",
        name: "Bitcoin Dup",
        assetClass: "crypto",
        provider: "coingecko",
        providerKey: "bitcoin",
        volumeRelevant: true,
        enabled: true,
      },
    ]);

    expect(() => parseWatchlistJson(json)).toThrowError(ValidationError);
  });

  it("rejects invalid asset classes and malformed payloads", () => {
    const invalidAssetClass = JSON.stringify([
      {
        id: "bad",
        symbol: "BAD",
        name: "Bad",
        assetClass: "stocks",
        provider: "coingecko",
        providerKey: "bad",
        volumeRelevant: false,
        enabled: true,
      },
    ]);

    expect(() => parseWatchlistJson("{")).toThrowError(ValidationError);
    expect(() => parseWatchlistJson(invalidAssetClass)).toThrowError(ValidationError);
  });
});
