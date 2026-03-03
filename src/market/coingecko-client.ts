import type { MarketSnapshotItem, WatchlistInstrument } from "../shared/types";
import { ValidationError } from "../shared/errors";

type FetchFn = typeof fetch;

interface CoinGeckoMarketRow {
  id: string;
  current_price: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency: number;
  total_volume?: number;
  last_updated?: string;
}

export function parseCoinGeckoMarketsJson(
  json: string,
  watchlist: WatchlistInstrument[],
): MarketSnapshotItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ValidationError("Invalid CoinGecko JSON", ["Response must be valid JSON"]);
  }

  if (!Array.isArray(parsed)) {
    throw new ValidationError("Invalid CoinGecko payload", ["Expected an array of market rows"]);
  }

  const rowById = new Map<string, CoinGeckoMarketRow>();
  for (const row of parsed as any[]) {
    if (typeof row?.id === "string") {
      rowById.set(row.id, row as CoinGeckoMarketRow);
    }
  }

  const capturedAt = new Date().toISOString();

  return watchlist
    .filter((instrument) => instrument.provider === "coingecko" && instrument.enabled)
    .flatMap((instrument) => {
      const row = rowById.get(instrument.providerKey);
      if (!row) {
        return [];
      }

      if (
        typeof (row as any).current_price !== "number" ||
        typeof (row as any).price_change_percentage_24h !== "number" ||
        typeof (row as any).price_change_percentage_7d_in_currency !== "number"
      ) {
        throw new ValidationError("Invalid CoinGecko numeric fields", [
          `Missing/invalid numbers for ${instrument.providerKey}`,
        ]);
      }

      const currentPrice = Number(row.current_price);
      const return24hPct = Number(row.price_change_percentage_24h);
      const return7dPct = Number(row.price_change_percentage_7d_in_currency);
      if (![currentPrice, return24hPct, return7dPct].every(Number.isFinite)) {
        throw new ValidationError("Invalid CoinGecko numeric fields", [
          `Missing/invalid numbers for ${instrument.providerKey}`,
        ]);
      }

      return [
        {
          instrumentId: instrument.id,
          capturedAt: row.last_updated ? new Date(row.last_updated).toISOString() : capturedAt,
          currentPrice,
          return24hPct,
          return7dPct,
          volume24h: Number.isFinite(Number(row.total_volume)) ? Number(row.total_volume) : undefined,
          currency: "usd",
          provider: "coingecko",
        } satisfies MarketSnapshotItem,
      ];
    });
}

export interface CoinGeckoClient {
  fetchMarketSnapshots(watchlist: WatchlistInstrument[]): Promise<MarketSnapshotItem[]>;
}

export function createCoinGeckoClient(options: {
  fetchFn?: FetchFn;
  apiKey?: string;
  baseUrl?: string;
} = {}): CoinGeckoClient {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.coingecko.com/api/v3";

  return {
    async fetchMarketSnapshots(watchlist) {
      const ids = watchlist
        .filter((instrument) => instrument.enabled && instrument.provider === "coingecko")
        .map((instrument) => instrument.providerKey);

      if (ids.length === 0) {
        return [];
      }

      const url = new URL(`${baseUrl}/coins/markets`);
      url.searchParams.set("vs_currency", "usd");
      url.searchParams.set("ids", ids.join(","));
      url.searchParams.set("price_change_percentage", "24h,7d");
      const headers: Record<string, string> = {};
      if (options.apiKey) {
        headers["x-cg-demo-api-key"] = options.apiKey;
      }
      const response = await fetchFn(url.toString(), { headers });
      const body = await response.text();
      if (!response.ok) {
        throw new ValidationError("CoinGecko request failed", [`HTTP ${response.status}`]);
      }
      return parseCoinGeckoMarketsJson(body, watchlist);
    },
  };
}
