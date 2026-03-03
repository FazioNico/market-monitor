import type { MacroSeriesObservation } from "../shared/types";
import type { ProviderRegistry } from "./provider-registry";

export interface MacroSeriesDefinition {
  seriesId: string;
  label: string;
}

export const DEFAULT_FRED_MACRO_SERIES: MacroSeriesDefinition[] = [
  { seriesId: "CPIAUCSL", label: "CPI" },
  { seriesId: "PCEPI", label: "PCE" },
  { seriesId: "UNRATE", label: "Unemployment" },
  { seriesId: "M2SL", label: "M2" },
];

export async function fetchMacroSeriesContext(
  providers: Pick<ProviderRegistry, "fred">,
  seriesDefinitions: MacroSeriesDefinition[] = DEFAULT_FRED_MACRO_SERIES,
): Promise<MacroSeriesObservation[]> {
  const all = await Promise.all(
    seriesDefinitions.map(async (series) => {
      const observations = await providers.fred.fetchSeriesObservations({
        seriesId: series.seriesId,
        label: series.label,
      });
      return observations[0];
    }),
  );

  return all.filter((obs): obs is MacroSeriesObservation => Boolean(obs));
}
