import type { MacroSeriesObservation, MarketSnapshotItem, RegimeAssessment, RiskInvalidationBlock } from "../shared/types";

export function buildRiskInvalidation(input: {
  regime: RegimeAssessment;
  marketSnapshot: MarketSnapshotItem[];
  macroContext: MacroSeriesObservation[];
}): RiskInvalidationBlock {
  const topMover = [...input.marketSnapshot].sort((a, b) => Math.abs(b.return24hPct) - Math.abs(a.return24hPct))[0];
  const cpi = input.macroContext.find((obs) => obs.seriesId === "CPIAUCSL");

  return {
    invalidationConditions: [
      `Regime flips away from ${input.regime.label} on next run due to momentum/correlation deterioration.`,
      "News flow shifts materially toward policy or liquidity shock headlines.",
    ],
    keyPriceThresholds: topMover
      ? [
          `${topMover.instrumentId}: monitor reversal if 24h move mean-reverts sharply from ${topMover.return24hPct.toFixed(2)}%.`,
        ]
      : ["No market snapshot thresholds available."],
    criticalMacroEvents: [
      cpi ? `Monitor next CPI update; latest context value ${cpi.value.toFixed(2)}.` : "Monitor CPI/PCE updates.",
      "Monitor central-bank communications and labor data releases.",
    ],
  };
}
