import { describe, expect, it } from "vitest";

import { buildRiskInvalidation } from "../../../src/analysis/risk-invalidation";

describe("risk invalidation", () => {
  it("builds non-empty invalidation and risk trigger lists", () => {
    const block = buildRiskInvalidation({
      regime: {
        label: "transition",
        dispersionSignal: "",
        correlationSignal: "",
        momentumSignal: "",
        macroSignal: "",
        macroContext: [],
        rationale: "",
      },
      marketSnapshot: [
        {
          instrumentId: "btc-usd",
          capturedAt: "2026-02-23T08:00:00.000Z",
          currentPrice: 100,
          return24hPct: 2,
          return7dPct: 1,
          currency: "usd",
          provider: "coingecko",
        },
      ],
      macroContext: [],
    });

    expect(block.invalidationConditions.length).toBeGreaterThan(0);
    expect(block.keyPriceThresholds.length).toBeGreaterThan(0);
    expect(block.criticalMacroEvents.length).toBeGreaterThan(0);
  });
});
