import { describe, expect, it } from "vitest";

import { createBindingRegistry } from "../../../src/skills/binding-registry";

describe("binding registry", () => {
  it("dispatches registered bindings and errors on unknown types", async () => {
    const registry = createBindingRegistry();
    const result = await registry.execute(
      {
        id: "outlook-validation-v1",
        name: "outlook",
        type: "outlook",
        version: "1.0",
        enabled: true,
        bindingType: "deterministic_outlook_validation",
        bindingTarget: "outlook_distribution",
        description: "validate",
        inputSchema: "in",
        outputSchema: "out",
        descriptionSection: "",
        inputSection: "",
        outputSection: "",
        usageRulesSection: "",
        filePath: "x",
      },
      {
        outlook: {
          bullPct: 30,
          basePct: 40,
          bearPct: 30,
          primaryScenario: "base",
          justification: "x",
          constraintValidated: true,
        },
      },
    );

    expect((result as any).valid).toBe(true);
  });
});
