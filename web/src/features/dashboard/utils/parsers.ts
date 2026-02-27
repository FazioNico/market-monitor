import type {
  RunListItem,
  RunReviewEventEnvelope,
  RunReviewServiceEvent,
} from "../../../types";
import type {
  EtfFlowUiDataset,
  EtfFlowUiRow,
  EtfFlowsSectionPayload,
  LiveRunState,
  TriggerType,
} from "../types";

import {
  asArray,
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  isRecord,
} from "./guards";

export function getEtfFlowsPayload(
  value: unknown,
): EtfFlowsSectionPayload | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  let snapshot: EtfFlowsSectionPayload["snapshot"];
  if (isRecord(value.snapshot)) {
    const datasets = asArray(value.snapshot.datasets)
      .map((dataset): EtfFlowUiDataset | undefined => {
        if (!isRecord(dataset)) return undefined;

        const rows = asArray(dataset.rows)
          .map((row): EtfFlowUiRow | undefined => {
            if (!isRecord(row)) return undefined;
            const date = asString(row.date);
            if (!date) return undefined;

            const byEtfNetFlowUsdM: Record<string, number | null> = {};
            if (isRecord(row.byEtfNetFlowUsdM)) {
              for (const [ticker, rawValue] of Object.entries(
                row.byEtfNetFlowUsdM,
              )) {
                if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
                  byEtfNetFlowUsdM[ticker] = rawValue;
                  continue;
                }
                if (rawValue === null) {
                  byEtfNetFlowUsdM[ticker] = null;
                }
              }
            }

            return {
              date,
              totalNetFlowUsdM:
                typeof row.totalNetFlowUsdM === "number" &&
                Number.isFinite(row.totalNetFlowUsdM)
                  ? row.totalNetFlowUsdM
                  : row.totalNetFlowUsdM === null
                    ? null
                    : null,
              byEtfNetFlowUsdM,
            };
          })
          .filter((row): row is EtfFlowUiRow => Boolean(row));

        return {
          asset: asString(dataset.asset),
          source: asString(dataset.source),
          pageUrl: asString(dataset.pageUrl),
          capturedAt: asString(dataset.capturedAt),
          etfTickers: asStringArray(dataset.etfTickers),
          rows,
        };
      })
      .filter((dataset): dataset is EtfFlowUiDataset => Boolean(dataset));

    snapshot = {
      source: asString(value.snapshot.source),
      capturedAt: asString(value.snapshot.capturedAt),
      datasets,
    };
  }

  return {
    available: asBoolean(value.available),
    error: asString(value.error),
    snapshot,
  };
}

export function getTopArticlesPayload(
  value: unknown,
): { items: Array<Record<string, unknown>>; method?: string } | undefined {
  if (!isRecord(value)) return undefined;
  const items = asArray(value.items).filter(
    (item): item is Record<string, unknown> => isRecord(item),
  );
  return {
    items,
    method: typeof value.method === "string" ? value.method : undefined,
  };
}

export function getMarketSnapshotPayload(
  value: unknown,
): Array<Record<string, unknown>> {
  return asArray(value).filter((item): item is Record<string, unknown> =>
    isRecord(item),
  );
}

const MACRO_COMMODITY_INSTRUMENT_IDS = new Set([
  "gold-usdc",
  "silver-usdc",
  "copper-usdc",
  "oil-usdc",
  "cl-usdc",
]);

export function isMacroCommoditySnapshotRow(row: Record<string, unknown>): boolean {
  const provider = asString(row.provider)?.toLowerCase() ?? "";
  if (!provider.includes("hyperliquid")) {
    return false;
  }

  const instrumentId = asString(row.instrumentId)?.toLowerCase() ?? "";
  if (MACRO_COMMODITY_INSTRUMENT_IDS.has(instrumentId)) {
    return true;
  }

  return (
    /(gold|silver|copper)/.test(instrumentId) ||
    /(^|[-_/])(cl|oil)([-_/]|$)/.test(instrumentId)
  );
}

export function isCryptoSnapshotRow(row: Record<string, unknown>): boolean {
  const provider = asString(row.provider)?.toLowerCase() ?? "";
  if (!(provider.includes("coingecko") || provider.includes("hyperliquid"))) {
    return false;
  }
  return !isMacroCommoditySnapshotRow(row);
}

export function isIndexSnapshotRow(row: Record<string, unknown>): boolean {
  const provider = asString(row.provider)?.toLowerCase() ?? "";
  return provider.includes("alphavantage");
}

export function splitMarketSnapshotRows(state?: LiveRunState): {
  all: Array<Record<string, unknown>>;
  crypto: Array<Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
  commodities: Array<Record<string, unknown>>;
  other: Array<Record<string, unknown>>;
} {
  const rows = getMarketSnapshotPayload(state?.sections.marketSnapshot);
  const commodityRows = rows.filter(isMacroCommoditySnapshotRow);
  const cryptoRows = rows.filter(isCryptoSnapshotRow);
  const indexRows = rows.filter(isIndexSnapshotRow);
  const otherRows = rows.filter(
    (row) =>
      !isMacroCommoditySnapshotRow(row) &&
      !isCryptoSnapshotRow(row) &&
      !isIndexSnapshotRow(row),
  );

  return {
    all: rows,
    crypto: cryptoRows,
    indexes: indexRows,
    commodities: commodityRows,
    other: otherRows,
  };
}

export function getMacroPayload(value: unknown): Array<Record<string, unknown>> {
  return asArray(value).filter((item): item is Record<string, unknown> =>
    isRecord(item),
  );
}

export function getReportPayload(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function parseRunListItemsFromJsonl(contents: string): RunListItem[] {
  const latestByRunId = new Map<string, RunListItem>();
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) {
      continue;
    }

    const runId = asString(parsed.runId);
    const triggerType = asString(parsed.triggerType) as TriggerType | undefined;
    const startedAt = asString(parsed.startedAt);
    const status = asString(parsed.status) as RunListItem["status"] | undefined;
    if (!runId || !triggerType || !startedAt || !status) {
      continue;
    }

    latestByRunId.set(runId, {
      runId,
      triggerType,
      startedAt,
      endedAt: asString(parsed.endedAt),
      status,
      reportStatus: asString(parsed.reportStatus) as
        | RunListItem["reportStatus"]
        | undefined,
      reportFilePath: asString(parsed.reportFilePath),
      llmStatus: asString(parsed.llmStatus) as RunListItem["llmStatus"] | undefined,
      messages: asStringArray(parsed.messages),
    });
  }

  return [...latestByRunId.values()].sort((a, b) => {
    const aMs = new Date(a.startedAt).getTime();
    const bMs = new Date(b.startedAt).getTime();
    return bMs - aMs;
  });
}

export function parseRunEventEnvelopesFromJsonl(
  contents: string,
): RunReviewEventEnvelope[] {
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const envelopes: RunReviewEventEnvelope[] = [];

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed) || !isRecord(parsed.event)) {
      continue;
    }

    const id = asNumber(parsed.id);
    const runId = asString(parsed.runId);
    const sentAt = asString(parsed.sentAt);
    if (id === undefined || !runId || !sentAt) {
      continue;
    }

    envelopes.push({
      id,
      runId,
      sentAt,
      event: parsed.event as RunReviewServiceEvent,
    });
  }

  return envelopes.sort((a, b) => a.id - b.id);
}

export function getRegimePayload(value: unknown):
  | {
      label?: "risk_on" | "risk_off" | "transition" | string;
      rationale?: string;
      dispersionSignal?: string;
      correlationSignal?: string;
      momentumSignal?: string;
      macroSignal?: string;
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  return {
    label: asString(value.label),
    rationale: asString(value.rationale),
    dispersionSignal: asString(value.dispersionSignal),
    correlationSignal: asString(value.correlationSignal),
    momentumSignal: asString(value.momentumSignal),
    macroSignal: asString(value.macroSignal),
  };
}

export function getSentimentPayload(value: unknown):
  | {
      score?: number;
      method?: string;
      narrativeSummary?: string;
      priceActionCoherence?: string;
      status?: string;
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  return {
    score: asNumber(value.score),
    method: asString(value.method),
    narrativeSummary: asString(value.narrativeSummary),
    priceActionCoherence: asString(value.priceActionCoherence),
    status: asString(value.status),
  };
}

export function getOutlookPayload(value: unknown):
  | {
      bullPct?: number;
      basePct?: number;
      bearPct?: number;
      primaryScenario?: string;
      justification?: string;
      constraintValidated?: boolean;
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  return {
    bullPct: asNumber(value.bullPct),
    basePct: asNumber(value.basePct),
    bearPct: asNumber(value.bearPct),
    primaryScenario: asString(value.primaryScenario),
    justification: asString(value.justification),
    constraintValidated:
      typeof value.constraintValidated === "boolean"
        ? value.constraintValidated
        : undefined,
  };
}

export function getPositioningPayload(value: unknown):
  | {
      currentBias?: string;
      addExposureConditions: string[];
      reduceExposureConditions: string[];
      noTradeZones: string[];
      timeHorizon?: string;
      status?: string;
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  return {
    currentBias: asString(value.currentBias),
    addExposureConditions: asStringArray(value.addExposureConditions),
    reduceExposureConditions: asStringArray(value.reduceExposureConditions),
    noTradeZones: asStringArray(value.noTradeZones),
    timeHorizon: asString(value.timeHorizon),
    status: asString(value.status),
  };
}

export function getRiskInvalidationPayload(value: unknown):
  | {
      invalidationConditions: string[];
      keyPriceThresholds: string[];
      criticalMacroEvents: string[];
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  return {
    invalidationConditions: asStringArray(value.invalidationConditions),
    keyPriceThresholds: asStringArray(value.keyPriceThresholds),
    criticalMacroEvents: asStringArray(value.criticalMacroEvents),
  };
}

export function getEtfRowTotalNetFlowUsdM(row: EtfFlowUiRow): number | null {
  if (
    typeof row.totalNetFlowUsdM === "number" &&
    Number.isFinite(row.totalNetFlowUsdM)
  ) {
    return row.totalNetFlowUsdM;
  }
  const values = Object.values(row.byEtfNetFlowUsdM).filter(
    (value): value is number => typeof value === "number",
  );
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

export function computeRecentEtfCumulative(
  dataset: EtfFlowUiDataset,
  days: number,
): number | null {
  const rows = dataset.rows.slice(-days);
  if (rows.length === 0) {
    return null;
  }
  const totals = rows
    .map((row) => getEtfRowTotalNetFlowUsdM(row))
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  if (totals.length === 0) {
    return null;
  }
  return totals.reduce((sum, value) => sum + value, 0);
}
