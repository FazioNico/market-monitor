import { describe, expect, it } from "vitest";

import { parseFredSeriesObservationsJson } from "../../../src/market/fred-client";

describe("fred client edge cases", () => {
  it("filters invalid/missing observation values instead of crashing", () => {
    const payload = JSON.stringify({
      units: "lin",
      observations: [
        { date: "2026-01-01", value: "." },
        { date: "2025-12-01", value: "100.2" },
      ],
    });

    const observations = parseFredSeriesObservationsJson({
      json: payload,
      seriesId: "CPIAUCSL",
      label: "CPI",
      fetchedAt: "2026-02-23T00:00:00.000Z",
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]?.value).toBeCloseTo(100.2, 1);
  });
});
