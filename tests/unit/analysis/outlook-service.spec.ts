import { describe, expect, it } from "vitest";

import { buildOutlookDistribution, validateOutlookDistribution } from "../../../src/analysis/outlook-service";
import { ValidationError } from "../../../src/shared/errors";

describe("outlook service", () => {
  it("produces a constrained distribution summing to 100 with cap <= 70", () => {
    const outlook = buildOutlookDistribution({
      regime: {
        label: "risk_on",
        dispersionSignal: "",
        correlationSignal: "",
        momentumSignal: "",
        macroSignal: "",
        macroContext: [],
        rationale: "",
      },
      sentiment: {
        score: 1.2,
        method: "deterministic",
        narrativeSummary: "",
        priceActionCoherence: "",
        status: "complete",
      },
    });

    expect(outlook.bullPct + outlook.basePct + outlook.bearPct).toBe(100);
    expect(Math.max(outlook.bullPct, outlook.basePct, outlook.bearPct)).toBeLessThanOrEqual(70);
  });

  it("rejects invalid distributions", () => {
    expect(() =>
      validateOutlookDistribution({
        bullPct: 80,
        basePct: 10,
        bearPct: 10,
        primaryScenario: "bull",
        justification: "x",
        constraintValidated: true,
      }),
    ).toThrowError(ValidationError);
  });
});
