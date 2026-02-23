import { describe, expect, it } from "vitest";

import { buildPositionWording } from "../../../src/analysis/position-wording";

describe("position wording (deterministic)", () => {
  it("returns required structured fields for complete output", async () => {
    const block = await buildPositionWording({
      regime: {
        label: "risk_on",
        dispersionSignal: "",
        correlationSignal: "",
        momentumSignal: "",
        macroSignal: "",
        macroContext: [],
        rationale: "",
      },
      outlook: {
        bullPct: 55,
        basePct: 30,
        bearPct: 15,
        primaryScenario: "bull",
        justification: "x",
        constraintValidated: true,
      },
    });

    expect(block.status).toBe("complete");
    expect(block.currentBias).toBeTruthy();
    expect(block.addExposureConditions?.length).toBeGreaterThan(0);
    expect(block.reduceExposureConditions?.length).toBeGreaterThan(0);
    expect(block.noTradeZones?.length).toBeGreaterThan(0);
    expect(block.timeHorizon).toBeTruthy();
  });
});
