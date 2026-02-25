import type { MarketSnapshotItem, WatchlistInstrument } from "../shared/types";
import type { ProviderRegistry } from "./provider-registry";

export async function buildMarketSnapshot(
  watchlist: WatchlistInstrument[],
  providers: Pick<ProviderRegistry, "coingecko" | "hyperliquid">,
): Promise<MarketSnapshotItem[]> {
  const [coingeckoSnapshots, hyperliquidSnapshots] = await Promise.all([
    providers.coingecko.fetchMarketSnapshots(watchlist),
    providers.hyperliquid.fetchMarketSnapshots(watchlist),
  ]);

  return [...coingeckoSnapshots, ...hyperliquidSnapshots];
}
