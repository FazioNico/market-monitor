import type { CoinGeckoClient } from "./coingecko-client";
import type { FredClient } from "./fred-client";
import type { HyperliquidClient } from "./hyperliquid-client";

export interface ProviderRegistry {
  coingecko: CoinGeckoClient;
  fred: FredClient;
  hyperliquid: HyperliquidClient;
}

export function createProviderRegistry(input: ProviderRegistry): ProviderRegistry {
  return input;
}
