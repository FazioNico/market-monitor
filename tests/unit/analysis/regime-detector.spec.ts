import { describe, expect, it } from "vitest";

import { detectRegime } from "../../../src/analysis/regime-detector";

describe("regime detector", () => {
  it("classifies risk-on when returns are constructive and unemployment is moderate", () => {
    const regime = detectRegime({
      marketSnapshot: [
        {
          instrumentId: "btc-usd",
          capturedAt: "2026-02-23T08:00:00.000Z",
          currentPrice: 100,
          return24hPct: 2.5,
          return7dPct: 1.1,
          currency: "usd",
          provider: "coingecko",
        },
      ],
      macroContext: [
        {
          seriesId: "UNRATE",
          label: "Unemployment",
          observedAt: "2026-01-01",
          value: 4.3,
          fetchedAt: "2026-02-23T08:00:00.000Z",
          provider: "fred",
        },
      ],
    });

    expect(regime.label).toBe("risk_on");
  });

  it("classifies risk-off when momentum is weak", () => {
    const regime = detectRegime({
      marketSnapshot: [
        {
          instrumentId: "btc-usd",
          capturedAt: "2026-02-23T08:00:00.000Z",
          currentPrice: 100,
          return24hPct: -1.2,
          return7dPct: -5.1,
          currency: "usd",
          provider: "coingecko",
        },
      ],
      macroContext: [],
    });

    expect(regime.label).toBe("risk_off");
  });
});
