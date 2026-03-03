import type { OutlookDistribution, RegimeAssessment, SentimentAssessment } from "../shared/types";
import { ValidationError } from "../shared/errors";

export function validateOutlookDistribution(outlook: OutlookDistribution): boolean {
  const values = [outlook.bullPct, outlook.basePct, outlook.bearPct];
  if (!values.every((value) => Number.isInteger(value) && value >= 0 && value <= 70)) {
    throw new ValidationError("Outlook percentages must be integers in [0,70]");
  }
  if (values.reduce((sum, value) => sum + value, 0) !== 100) {
    throw new ValidationError("Outlook percentages must sum to 100");
  }
  return true;
}

export function normalizeOutlookDistribution(input: {
  bullPct: number;
  basePct: number;
  bearPct: number;
  justification: string;
}): OutlookDistribution {
  const clamp = (value: number) => Math.max(0, Math.min(70, Math.round(value)));
  let bull = clamp(input.bullPct);
  let base = clamp(input.basePct);
  let bear = clamp(input.bearPct);

  let total = bull + base + bear;
  if (total === 0) {
    bull = 30;
    base = 40;
    bear = 30;
    total = 100;
  }

  while (total !== 100) {
    const deficit = 100 - total;
    if (deficit > 0) {
      if (base < 70) {
        base += 1;
      } else if (bull < 70) {
        bull += 1;
      } else {
        bear += 1;
      }
    } else {
      if (base > 0) {
        base -= 1;
      } else if (bull > 0) {
        bull -= 1;
      } else {
        bear -= 1;
      }
    }
    total = bull + base + bear;
  }

  const ranked: Array<["bull" | "base" | "bear", number]> = [
    ["bull", bull],
    ["base", base],
    ["bear", bear],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  const primaryScenario = ranked[0]![0];

  const outlook: OutlookDistribution = {
    bullPct: bull,
    basePct: base,
    bearPct: bear,
    primaryScenario,
    justification: input.justification,
    constraintValidated: true,
  };
  validateOutlookDistribution(outlook);
  return outlook;
}

export function buildOutlookDistribution(input: {
  regime: RegimeAssessment;
  sentiment: SentimentAssessment;
}): OutlookDistribution {
  let bull = 30;
  let base = 40;
  let bear = 30;

  if (input.regime.label === "risk_on") {
    bull += 20;
    bear -= 10;
    base -= 10;
  } else if (input.regime.label === "risk_off") {
    bear += 20;
    bull -= 10;
    base -= 10;
  }

  if (input.sentiment.status === "complete" && typeof input.sentiment.score === "number") {
    bull += Math.round(input.sentiment.score * 5);
    bear -= Math.round(input.sentiment.score * 5);
  }

  return normalizeOutlookDistribution({
    bullPct: bull,
    basePct: base,
    bearPct: bear,
    justification: `Distribution derived from ${input.regime.label} regime and ${input.sentiment.method} sentiment.`,
  });
}
