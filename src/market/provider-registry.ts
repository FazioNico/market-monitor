import type { CoinGeckoClient } from "./coingecko-client";
import type { FredClient } from "./fred-client";

export interface ProviderRegistry {
  coingecko: CoinGeckoClient;
  fred: FredClient;
}

export function createProviderRegistry(input: ProviderRegistry): ProviderRegistry {
  return input;
}
