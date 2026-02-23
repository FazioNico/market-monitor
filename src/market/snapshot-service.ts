import type { MarketSnapshotItem, WatchlistInstrument } from "../shared/types";
import type { ProviderRegistry } from "./provider-registry";

export async function buildMarketSnapshot(
  watchlist: WatchlistInstrument[],
  providers: Pick<ProviderRegistry, "coingecko">,
): Promise<MarketSnapshotItem[]> {
  return providers.coingecko.fetchMarketSnapshots(watchlist);
}
