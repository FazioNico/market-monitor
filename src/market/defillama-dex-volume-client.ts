import type { DefiDexVolumeSnapshot } from "../shared/types";
import { ValidationError } from "../shared/errors";

type FetchFn = typeof fetch;

function parseFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pctChange(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous <= 0) {
    return undefined;
  }
  return ((current - previous) / previous) * 100;
}

function extractValue(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const parsed = parseFiniteNumber(record[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

export function parseDefiLlamaDexOverviewJson(json: string): DefiDexVolumeSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ValidationError("Invalid DefiLlama JSON", ["Response must be valid JSON"]);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ValidationError("Invalid DefiLlama payload", ["Expected a DEX overview object"]);
  }

  const record = parsed as Record<string, unknown>;
  const currentVolume24hUsd = extractValue(record, [
    "total24h",
    "total24hVolume",
    "totalVolume24h",
    "volume24h",
  ]);
  if (currentVolume24hUsd === undefined) {
    throw new ValidationError("Invalid DefiLlama payload", ["Missing current 24h DEX volume"]);
  }

  const previous24hUsd = extractValue(record, [
    "total48hto24h",
    "previous24h",
    "prev24h",
    "total24hPrev",
  ]);

  const current7dUsd = extractValue(record, [
    "total7d",
    "total7dVolume",
    "volume7d",
  ]);
  const previous7dUsd = extractValue(record, [
    "total14dto7d",
    "previous7d",
    "prev7d",
    "total7dPrev",
  ]);

  const change24hUsd =
    previous24hUsd === undefined ? undefined : currentVolume24hUsd - previous24hUsd;
  const change7dUsd =
    current7dUsd === undefined || previous7dUsd === undefined
      ? undefined
      : current7dUsd - previous7dUsd;

  return {
    source: "defillama",
    capturedAt: new Date().toISOString(),
    currentVolume24hUsd,
    change24hUsd,
    change7dUsd,
    change24hPct: pctChange(currentVolume24hUsd, previous24hUsd),
    change7dPct: current7dUsd === undefined ? undefined : pctChange(current7dUsd, previous7dUsd),
  } satisfies DefiDexVolumeSnapshot;
}

export interface DefiLlamaDexVolumeClient {
  fetchDexVolumeSnapshot(): Promise<DefiDexVolumeSnapshot>;
}

export function createDefiLlamaDexVolumeClient(options: {
  fetchFn?: FetchFn;
  baseUrl?: string;
} = {}): DefiLlamaDexVolumeClient {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.llama.fi";

  return {
    async fetchDexVolumeSnapshot() {
      const url = new URL("/overview/dexs", baseUrl);
      const response = await fetchFn(url.toString());
      const body = await response.text();

      if (!response.ok) {
        throw new ValidationError("DefiLlama DEX volume request failed", [`HTTP ${response.status}`]);
      }

      return parseDefiLlamaDexOverviewJson(body);
    },
  };
}
