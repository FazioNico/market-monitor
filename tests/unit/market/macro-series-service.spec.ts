import { describe, expect, it } from "vitest";

import { fetchMacroSeriesContext } from "../../../src/market/macro-series-service";

describe("macro series service", () => {
  it("fetches latest observations for the default FRED series set", async () => {
    const calls: string[] = [];
    const result = await fetchMacroSeriesContext(
      {
        fred: {
          fetchSeriesObservations: async ({
            seriesId,
            label,
          }: {
            seriesId: string;
            label: string;
          }) => {
            calls.push(seriesId);
            return [
              {
                seriesId,
                label,
                observedAt: "2026-01-01",
                value: 100,
                fetchedAt: "2026-02-23T08:00:00.000Z",
                provider: "fred",
              },
            ];
          },
        },
      } as any,
    );

    expect(calls).toEqual(["CPIAUCSL", "PCEPI", "UNRATE", "M2SL"]);
    expect(result).toHaveLength(4);
  });
});
