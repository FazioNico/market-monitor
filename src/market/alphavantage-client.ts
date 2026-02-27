import type { MarketSnapshotItem, WatchlistInstrument } from "../shared/types";
import { ValidationError } from "../shared/errors";

type FetchFn = typeof fetch;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AlphaVantageDailyBar {
  "4. close"?: string;
  "5. volume"?: string;
}

interface AlphaVantageDailyResponse {
  "Time Series (Daily)"?: Record<string, AlphaVantageDailyBar>;
  "Error Message"?: string;
  Information?: string;
  Note?: string;
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseAlphaVantageDailySeriesJson(input: {
  json: string;
  instrument: WatchlistInstrument;
}): MarketSnapshotItem {
  let parsed: AlphaVantageDailyResponse;
  try {
    parsed = JSON.parse(input.json) as AlphaVantageDailyResponse;
  } catch {
    throw new ValidationError("Invalid Alpha Vantage JSON", ["Response must be valid JSON"]);
  }

  const series = parsed["Time Series (Daily)"];
  if (!series || typeof series !== "object" || Array.isArray(series)) {
    const providerMessage = parsed["Error Message"] ?? parsed.Information ?? parsed.Note;
    throw new ValidationError("Invalid Alpha Vantage payload", [
      providerMessage ?? `Missing Time Series (Daily) for ${input.instrument.providerKey}`,
    ]);
  }

  const dates = Object.keys(series).sort((left, right) => right.localeCompare(left));
  const latestDate = dates[0];
  const previousDate = dates[1];
  if (!latestDate || !previousDate) {
    throw new ValidationError("Invalid Alpha Vantage payload", [
      `Not enough daily bars for ${input.instrument.providerKey}`,
    ]);
  }

  const latestBar = series[latestDate];
  const previousBar = series[previousDate];
  const sevenDayDate = dates[7];
  const sevenDayBar = sevenDayDate ? series[sevenDayDate] : undefined;

  const currentPrice = parsePositiveNumber(latestBar?.["4. close"]);
  const previousClose = parsePositiveNumber(previousBar?.["4. close"]);
  if (currentPrice === undefined || previousClose === undefined) {
    throw new ValidationError("Invalid Alpha Vantage numeric fields", [
      `Missing closing prices for ${input.instrument.providerKey}`,
    ]);
  }

  const sevenDayClose = parsePositiveNumber(sevenDayBar?.["4. close"]);
  const volume24h = parseOptionalNumber(latestBar?.["5. volume"]);

  return {
    instrumentId: input.instrument.id,
    capturedAt: new Date(`${latestDate}T00:00:00.000Z`).toISOString(),
    currentPrice,
    return24hPct: ((currentPrice - previousClose) / previousClose) * 100,
    return7dPct:
      sevenDayClose && sevenDayClose > 0 ? ((currentPrice - sevenDayClose) / sevenDayClose) * 100 : 0,
    volume24h,
    currency: "usd",
    provider: "alphavantage",
  } satisfies MarketSnapshotItem;
}

export interface AlphaVantageClient {
  fetchMarketSnapshots(watchlist: WatchlistInstrument[]): Promise<MarketSnapshotItem[]>;
}

export function createAlphaVantageClient(options: {
  fetchFn?: FetchFn;
  apiKey?: string;
  baseUrl?: string;
  requestSpacingMs?: number;
} = {}): AlphaVantageClient {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? "https://www.alphavantage.co/query";
  const requestSpacingMs = options.requestSpacingMs ?? 12_500;

  return {
    async fetchMarketSnapshots(watchlist) {
      const instruments = watchlist.filter(
        (instrument) => instrument.enabled && instrument.provider === "alphavantage",
      );

      if (instruments.length === 0 || !options.apiKey) {
        return [];
      }
      const apiKey = options.apiKey;
      const snapshots: MarketSnapshotItem[] = [];

      for (const [index, instrument] of instruments.entries()) {
        if (index > 0 && requestSpacingMs > 0) {
          await sleep(requestSpacingMs);
        }

        try {
          const url = new URL(baseUrl);
          url.searchParams.set("function", "TIME_SERIES_DAILY");
          url.searchParams.set("symbol", instrument.providerKey);
          url.searchParams.set("outputsize", "compact");
          url.searchParams.set("apikey", apiKey);

          const response = await fetchFn(url.toString());
          const body = await response.text();
          if (!response.ok) {
            throw new ValidationError("Alpha Vantage request failed", [
              `HTTP ${response.status}`,
              `symbol=${instrument.providerKey}`,
            ]);
          }
          snapshots.push(parseAlphaVantageDailySeriesJson({ json: body, instrument }));
        } catch {
          continue;
        }
      }

      return snapshots;
    },
  };
}
