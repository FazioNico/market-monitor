import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseFredSeriesObservationsJson } from "../../../src/market/fred-client";

describe("fred client parsing", () => {
  it("parses observations fixture and maps finite values", async () => {
    const fixture = await readFile(
      join(process.cwd(), "tests", "fixtures", "fred", "series-observations.json"),
      "utf8",
    );

    const observations = parseFredSeriesObservationsJson({
      json: fixture,
      seriesId: "CPIAUCSL",
      label: "CPI",
      fetchedAt: "2026-02-23T08:10:00.000Z",
    });

    expect(observations.length).toBeGreaterThan(0);
    expect(observations[0]).toMatchObject({
      seriesId: "CPIAUCSL",
      label: "CPI",
      provider: "fred",
    });
    expect(observations[0]!.value).toBeCloseTo(317.2, 2);
  });
});
