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

  it("accepts common snake_case keys from LLM output", async () => {
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
            current_bias: "Measured neutral bias",
            add_exposure_conditions: ["Add on confirmation"],
            reduce_exposure_conditions: ["Reduce on breakdown"],
            no_trade_zones: ["Avoid low liquidity"],
            time_horizon: "Intraday to 1-3 days",
          }) as any,
      },
    );

    expect(block.status).toBe("complete");
    expect(block.addExposureConditions?.[0]).toContain("Add on confirmation");
    expect(block.noTradeZones?.[0]).toContain("Avoid low liquidity");
  });

  it("accepts wrapped payloads and converts multiline strings into arrays", async () => {
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
            position_wording: {
              current_bias: "Measured neutral bias",
              add_exposure_conditions: "- Add on confirmation\n- Add on breadth improvement",
              reduce_exposure_conditions: "- Reduce on breakdown",
              no_trade_zones: "- Avoid event spikes; - Avoid low liquidity",
              time_horizon: "1-3 trading days",
            },
          }) as any,
      },
    );

    expect(block.status).toBe("complete");
    expect(block.addExposureConditions?.length).toBeGreaterThanOrEqual(2);
    expect(block.reduceExposureConditions?.length).toBe(1);
    expect(block.noTradeZones?.length).toBeGreaterThanOrEqual(2);
  });
});
