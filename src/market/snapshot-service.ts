import type { MarketSnapshotItem, WatchlistInstrument } from "../shared/types";
import type { ProviderRegistry } from "./provider-registry";

export async function buildMarketSnapshot(
  watchlist: WatchlistInstrument[],
  providers: Pick<ProviderRegistry, "alphavantage" | "coingecko" | "hyperliquid">,
): Promise<MarketSnapshotItem[]> {
  const [alphaVantageSnapshots, coingeckoSnapshots, hyperliquidSnapshots] = await Promise.all([
    providers.alphavantage.fetchMarketSnapshots(watchlist),
    providers.coingecko.fetchMarketSnapshots(watchlist),
    providers.hyperliquid.fetchMarketSnapshots(watchlist),
  ]);

  return [...alphaVantageSnapshots, ...coingeckoSnapshots, ...hyperliquidSnapshots];
}
