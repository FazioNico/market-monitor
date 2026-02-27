import type { MacroSeriesObservation, MarketSnapshotItem, RegimeAssessment } from "../shared/types";

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function detectRegime(input: {
  marketSnapshot: MarketSnapshotItem[];
  macroContext: MacroSeriesObservation[];
}): RegimeAssessment {
  const avg24h = average(input.marketSnapshot.map((item) => item.return24hPct));
  const avg7d = average(input.marketSnapshot.map((item) => item.return7dPct));
  const unemployment = input.macroContext.find((obs) => obs.seriesId === "UNRATE")?.value;

  let label: RegimeAssessment["label"] = "transition";
  if (avg24h > 0.3 && avg7d > -1 && (unemployment === undefined || unemployment < 6)) {
    label = "risk_on";
  } else if (avg24h < -0.3 || avg7d < -3) {
    label = "risk_off";
  }

  return {
    label,
    dispersionSignal:
      input.marketSnapshot.length > 1
        ? "Mixed cross-asset returns observed."
        : "Single-instrument snapshot; dispersion signal limited.",
    correlationSignal: avg24h >= 0 ? "Short-term correlation bias positive." : "Short-term correlation bias defensive.",
    momentumSignal:
      avg24h > 0 ? `24h momentum positive (${avg24h.toFixed(2)}%).` : `24h momentum soft (${avg24h.toFixed(2)}%).`,
    macroSignal:
      unemployment !== undefined
        ? `Macro context includes unemployment at ${unemployment.toFixed(2)}.`
        : "Macro context partially unavailable.",
    macroContext: input.macroContext,
    rationale: `Regime classified as ${label} using market momentum and available macro context.`,
  };
}
