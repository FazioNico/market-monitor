import { readFile } from "node:fs/promises";
import { z } from "zod";

import { ValidationError } from "../shared/errors";
import type { WatchlistInstrument } from "../shared/types";

const assetClassSchema = z.enum(["crypto", "index", "fx", "rates", "commodity"]);

const watchlistInstrumentSchema = z.object({
  id: z.string().trim().min(1),
  symbol: z.string().trim().min(1),
  name: z.string().trim().min(1),
  assetClass: assetClassSchema,
  provider: z.string().trim().min(1),
  providerKey: z.string().trim().min(1),
  volumeRelevant: z.boolean(),
  enabled: z.boolean().default(true),
});

const watchlistSchema = z.array(watchlistInstrumentSchema);

export interface WatchlistConfig {
  allInstruments: WatchlistInstrument[];
  instruments: WatchlistInstrument[];
}

function validateUniqueProviderKeys(instruments: WatchlistInstrument[]): void {
  const seen = new Set<string>();

  for (const instrument of instruments) {
    if (!instrument.enabled) {
      continue;
    }

    const key = `${instrument.provider.toLowerCase()}::${instrument.providerKey.toLowerCase()}`;
    if (seen.has(key)) {
      throw new ValidationError("Duplicate providerKey among enabled watchlist instruments", [
        `Duplicate key for provider ${instrument.provider}: ${instrument.providerKey}`,
      ]);
    }
    seen.add(key);
  }
}

export function parseWatchlistJson(json: string): WatchlistConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ValidationError("Invalid watchlist JSON", ["config/watchlist.json must be valid JSON"]);
  }

  const result = watchlistSchema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError("Invalid watchlist structure", result.error.issues.map((issue) => issue.message));
  }

  const allInstruments = result.data.map((instrument) => ({
    ...instrument,
    id: instrument.id.trim(),
    symbol: instrument.symbol.trim(),
    name: instrument.name.trim(),
    provider: instrument.provider.trim(),
    providerKey: instrument.providerKey.trim(),
  })) satisfies WatchlistInstrument[];

  validateUniqueProviderKeys(allInstruments);

  return {
    allInstruments,
    instruments: allInstruments.filter((instrument) => instrument.enabled),
  };
}

export async function readWatchlistFile(filePath: string): Promise<WatchlistConfig> {
  const contents = await readFile(filePath, "utf8");
  return parseWatchlistJson(contents);
}
