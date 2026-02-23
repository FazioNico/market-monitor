import { describe, expect, it } from "vitest";

import { ValidationError } from "../../../src/shared/errors";
import { parseCoinGeckoMarketsJson } from "../../../src/market/coingecko-client";

describe("coingecko client edge cases", () => {
  it("throws when required numeric fields are missing", () => {
    const payload = JSON.stringify([
      {
        id: "bitcoin",
        current_price: null,
        price_change_percentage_24h: 1,
        price_change_percentage_7d_in_currency: 2,
      },
    ]);

    expect(() =>
      parseCoinGeckoMarketsJson(payload, [
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
    ).toThrowError(ValidationError);
  });
});
