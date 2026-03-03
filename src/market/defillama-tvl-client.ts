import type { DefiTvlSnapshot } from "../shared/types";
import { ValidationError } from "../shared/errors";

type FetchFn = typeof fetch;

interface TvlChartPoint {
  date?: number | string;
  totalLiquidityUSD?: number | string;
  totalLiquidityUsd?: number | string;
  tvl?: number | string;
  totalTVL?: number | string;
}

function parseFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizePointTimestamp(value: unknown): number | undefined {
  const numeric = parseFiniteNumber(value);
  if (numeric === undefined) {
    return undefined;
  }
  return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function extractPointValue(point: TvlChartPoint): number | undefined {
  return (
    parseFiniteNumber(point.totalLiquidityUSD) ??
    parseFiniteNumber(point.totalLiquidityUsd) ??
    parseFiniteNumber(point.tvl) ??
    parseFiniteNumber(point.totalTVL)
  );
}

function formatTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function pctChange(current: number, previous: number | undefined): number | undefined {
  if (previous === undefined || previous <= 0) {
    return undefined;
  }
  return ((current - previous) / previous) * 100;
}

function findReferenceValue(
  points: Array<{ timestampSec: number; valueUsd: number }>,
  targetOffsetSec: number,
): { timestampSec: number; valueUsd: number } | undefined {
  const latest = points.at(-1);
  if (!latest) {
    return undefined;
  }

  const cutoff = latest.timestampSec - targetOffsetSec;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    if (point.timestampSec <= cutoff) {
      return point;
    }
  }

  return undefined;
}

function extractSeries(payload: unknown): unknown[] | undefined {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.chart)) {
    return record.chart;
  }
  if (Array.isArray(record.charts)) {
    return record.charts;
  }
  if (Array.isArray(record.tvl)) {
    return record.tvl;
  }
  const aggregatedByDate = new Map<number, number>();
  let foundNestedSeries = false;
  for (const value of Object.values(record)) {
    if (!Array.isArray(value)) {
      continue;
    }
    foundNestedSeries = true;
    for (const item of value) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const point = item as TvlChartPoint;
      const timestampSec = normalizePointTimestamp(point.date);
      const valueUsd = extractPointValue(point);
      if (timestampSec === undefined || valueUsd === undefined) {
        continue;
      }
      aggregatedByDate.set(timestampSec, (aggregatedByDate.get(timestampSec) ?? 0) + valueUsd);
    }
  }
  if (foundNestedSeries && aggregatedByDate.size > 0) {
    return [...aggregatedByDate.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([date, totalLiquidityUSD]) => ({ date, totalLiquidityUSD }));
  }

  return undefined;
}

export function parseDefiLlamaTvlChartJson(json: string): DefiTvlSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ValidationError("Invalid DefiLlama JSON", ["Response must be valid JSON"]);
  }

  const series = extractSeries(parsed);
  if (!series) {
    throw new ValidationError("Invalid DefiLlama payload", ["Expected a TVL chart array"]);
  }

  const points = series
    .map((item): { timestampSec: number; valueUsd: number } | undefined => {
      if (!item || typeof item !== "object") {
        return undefined;
      }
      const point = item as TvlChartPoint;
      const timestampSec = normalizePointTimestamp(point.date);
      const valueUsd = extractPointValue(point);
      if (timestampSec === undefined || valueUsd === undefined) {
        return undefined;
      }
      return { timestampSec, valueUsd };
    })
    .filter((item): item is { timestampSec: number; valueUsd: number } => Boolean(item))
    .sort((left, right) => left.timestampSec - right.timestampSec);

  const latest = points.at(-1);
  if (!latest) {
    throw new ValidationError("Invalid DefiLlama payload", ["No usable TVL points found"]);
  }

  const reference24h = findReferenceValue(points, 24 * 60 * 60);
  const reference7d = findReferenceValue(points, 7 * 24 * 60 * 60);

  return {
    source: "defillama",
    capturedAt: formatTimestamp(latest.timestampSec),
    currentTvlUsd: latest.valueUsd,
    change24hUsd:
      reference24h === undefined ? undefined : latest.valueUsd - reference24h.valueUsd,
    change7dUsd:
      reference7d === undefined ? undefined : latest.valueUsd - reference7d.valueUsd,
    change24hPct: pctChange(latest.valueUsd, reference24h?.valueUsd),
    change7dPct: pctChange(latest.valueUsd, reference7d?.valueUsd),
    reference24hAt:
      reference24h === undefined ? undefined : formatTimestamp(reference24h.timestampSec),
    reference7dAt:
      reference7d === undefined ? undefined : formatTimestamp(reference7d.timestampSec),
  } satisfies DefiTvlSnapshot;
}

export interface DefiLlamaTvlClient {
  fetchDefiTvlSnapshot(): Promise<DefiTvlSnapshot>;
}

export function createDefiLlamaTvlClient(options: {
  fetchFn?: FetchFn;
  baseUrl?: string;
} = {}): DefiLlamaTvlClient {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.llama.fi";

  return {
    async fetchDefiTvlSnapshot() {
      const url = new URL("/v2/historicalChainTvl", baseUrl);
      const response = await fetchFn(url.toString());
      const body = await response.text();

      if (!response.ok) {
        throw new ValidationError("DefiLlama TVL request failed", [`HTTP ${response.status}`]);
      }

      return parseDefiLlamaTvlChartJson(body);
    },
  };
}
