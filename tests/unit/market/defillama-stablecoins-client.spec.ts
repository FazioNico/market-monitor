import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseDefiLlamaStablecoinChartJson } from "../../../src/market/defillama-stablecoins-client";

describe("defillama stablecoins client parsing", () => {
  it("maps chart history into current supply plus 24h / 7d deltas", async () => {
    const fixture = await readFile(
      join(process.cwd(), "tests", "fixtures", "defillama", "stablecoincharts-all.json"),
      "utf8",
    );

    const snapshot = parseDefiLlamaStablecoinChartJson(fixture);

    expect(snapshot).toMatchObject({
      source: "defillama",
      currentSupplyUsd: 220500000000,
      change24hUsd: 800000000,
      change7dUsd: 6500000000,
    });
    expect(snapshot.change24hPct).toBeCloseTo(0.36, 2);
    expect(snapshot.change7dPct).toBeCloseTo(3.04, 2);
  });
});
