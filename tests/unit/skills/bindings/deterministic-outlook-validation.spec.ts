import { describe, expect, it } from "vitest";

import { deterministicOutlookValidationBinding } from "../../../../src/skills/bindings/deterministic-outlook-validation";
import { ValidationError } from "../../../../src/shared/errors";

describe("deterministic outlook validation binding", () => {
  it("accepts valid outlook distributions and rejects invalid ones", async () => {
    await expect(
      deterministicOutlookValidationBinding({
        outlook: {
          bullPct: 30,
          basePct: 40,
          bearPct: 30,
          primaryScenario: "base",
          justification: "ok",
          constraintValidated: true,
        },
      }),
    ).resolves.toMatchObject({ valid: true });

    await expect(
      deterministicOutlookValidationBinding({
        outlook: {
          bullPct: 80,
          basePct: 10,
          bearPct: 10,
          primaryScenario: "bull",
          justification: "bad",
          constraintValidated: true,
        },
      }),
    ).rejects.toThrowError(ValidationError);
  });
});
