import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseDefiLlamaTvlChartJson } from "../../../src/market/defillama-tvl-client";

describe("defillama tvl client parsing", () => {
  it("maps TVL history into current TVL plus 24h / 7d deltas", async () => {
    const fixture = await readFile(
      join(process.cwd(), "tests", "fixtures", "defillama", "historical-chain-tvl.json"),
      "utf8",
    );

    const snapshot = parseDefiLlamaTvlChartJson(fixture);

    expect(snapshot).toMatchObject({
      source: "defillama",
      currentTvlUsd: 113000000000,
      change24hUsd: 700000000,
      change7dUsd: 5000000000,
    });
    expect(snapshot.change24hPct).toBeCloseTo(0.62, 2);
    expect(snapshot.change7dPct).toBeCloseTo(4.63, 2);
  });
});
