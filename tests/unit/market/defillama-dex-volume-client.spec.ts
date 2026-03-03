import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseDefiLlamaDexOverviewJson } from "../../../src/market/defillama-dex-volume-client";

describe("defillama dex volume client parsing", () => {
  it("maps DEX overview into 24h volume plus 24h / 7d deltas", async () => {
    const fixture = await readFile(
      join(process.cwd(), "tests", "fixtures", "defillama", "dex-overview.json"),
      "utf8",
    );

    const snapshot = parseDefiLlamaDexOverviewJson(fixture);

    expect(snapshot).toMatchObject({
      source: "defillama",
      currentVolume24hUsd: 18500000000,
      change24hUsd: 1300000000,
      change7dUsd: 8000000000,
    });
    expect(snapshot.change24hPct).toBeCloseTo(7.56, 2);
    expect(snapshot.change7dPct).toBeCloseTo(6.78, 2);
  });
});
