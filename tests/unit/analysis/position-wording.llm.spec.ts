import { describe, expect, it } from "vitest";

import { buildPositionWording } from "../../../src/analysis/position-wording";

describe("position wording service (llm-assisted constraints)", () => {
  it("enforces structured output and non-emotional wording", async () => {
    const block = await buildPositionWording(
      {
        regime: {
          label: "transition",
          dispersionSignal: "",
          correlationSignal: "",
          momentumSignal: "",
          macroSignal: "",
          macroContext: [],
          rationale: "",
        },
        outlook: {
          bullPct: 30,
          basePct: 40,
          bearPct: 30,
          primaryScenario: "base",
          justification: "x",
          constraintValidated: true,
        },
      },
      {
        llmBinding: async () =>
          ({
            currentBias: "Amazing bullish setup!!!",
            addExposureConditions: ["Guaranteed breakout!"],
            reduceExposureConditions: ["Panic if support breaks!"],
            noTradeZones: ["Euphoric spikes!"],
            timeHorizon: "1-3 days!",
            status: "complete",
          }) as any,
      },
    );

    expect(block.status).toBe("complete");
    expect(block.currentBias).not.toMatch(/Amazing|!|Guaranteed/i);
    expect(block.addExposureConditions?.[0]).not.toMatch(/Guaranteed|!/i);
    expect(block.reduceExposureConditions?.[0]).not.toMatch(/Panic|!/i);
    expect(block.noTradeZones?.[0]).not.toMatch(/Euphoric|!/i);
  });
});
