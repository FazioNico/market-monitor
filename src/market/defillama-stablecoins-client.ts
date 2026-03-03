import type { StablecoinSupplySnapshot } from "../shared/types";
import { ValidationError } from "../shared/errors";

type FetchFn = typeof fetch;

interface StablecoinChartPoint {
  date?: number | string;
  totalCirculatingUSD?: number | string | Record<string, number | string>;
  totalCirculating?: number | string | Record<string, number | string>;
}

function parseFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function normalizePointTimestamp(value: unknown): number | undefined {
  const numeric = parseFiniteNumber(value);
  if (numeric === undefined) {
    return undefined;
  }
  // DefiLlama chart payloads are unix timestamps in seconds.
  return numeric > 1_000_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function extractUsdValue(value: unknown): number | undefined {
  const direct = parseFiniteNumber(value);
  if (direct !== undefined) {
    return direct;
  }

  if (value && typeof value === "object") {
    const entries = value as Record<string, unknown>;
    const peggedUsd = parseFiniteNumber(entries.peggedUSD);
    if (peggedUsd !== undefined) {
      return peggedUsd;
    }

    const firstNumeric = Object.values(entries)
      .map((entry) => parseFiniteNumber(entry))
      .find((entry): entry is number => entry !== undefined);
    if (firstNumeric !== undefined) {
      return firstNumeric;
    }
  }

  return undefined;
}

function extractPointValue(point: StablecoinChartPoint): number | undefined {
  return extractUsdValue(point.totalCirculatingUSD) ?? extractUsdValue(point.totalCirculating);
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

export function parseDefiLlamaStablecoinChartJson(
  json: string,
): StablecoinSupplySnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ValidationError("Invalid DefiLlama JSON", ["Response must be valid JSON"]);
  }

  if (!Array.isArray(parsed)) {
    throw new ValidationError("Invalid DefiLlama payload", ["Expected an array of chart points"]);
  }

  const points = parsed
    .map((item): { timestampSec: number; valueUsd: number } | undefined => {
      if (!item || typeof item !== "object") {
        return undefined;
      }
      const point = item as StablecoinChartPoint;
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
    throw new ValidationError("Invalid DefiLlama payload", ["No usable stablecoin supply points found"]);
  }

  const reference24h = findReferenceValue(points, 24 * 60 * 60);
  const reference7d = findReferenceValue(points, 7 * 24 * 60 * 60);

  return {
    source: "defillama",
    capturedAt: formatTimestamp(latest.timestampSec),
    currentSupplyUsd: latest.valueUsd,
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
  } satisfies StablecoinSupplySnapshot;
}

export interface DefiLlamaStablecoinsClient {
  fetchStablecoinSupplySnapshot(): Promise<StablecoinSupplySnapshot>;
}

export function createDefiLlamaStablecoinsClient(options: {
  fetchFn?: FetchFn;
  baseUrl?: string;
} = {}): DefiLlamaStablecoinsClient {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? "https://stablecoins.llama.fi";

  return {
    async fetchStablecoinSupplySnapshot() {
      const url = new URL("/stablecoincharts/all", baseUrl);
      const response = await fetchFn(url.toString());
      const body = await response.text();

      if (!response.ok) {
        throw new ValidationError("DefiLlama stablecoins request failed", [`HTTP ${response.status}`]);
      }

      return parseDefiLlamaStablecoinChartJson(body);
    },
  };
}
