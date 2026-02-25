import { HttpTransport, InfoClient } from "@nktkas/hyperliquid";

import type { MarketSnapshotItem, WatchlistInstrument } from "../shared/types";
import { ValidationError } from "../shared/errors";

type HyperliquidMidPriceMap = Record<string, string | number>;

interface HyperliquidSpotMeta {
  universe: Array<{
    tokens: number[];
    name: string;
  }>;
  tokens: Array<{
    index: number;
    name: string;
  }>;
}

interface HyperliquidSpotAssetContext {
  coin: string;
  prevDayPx: string | number;
  dayNtlVlm: string | number;
  midPx: string | number | null;
  markPx: string | number;
}

type HyperliquidSpotMetaAndAssetCtxs = [HyperliquidSpotMeta, HyperliquidSpotAssetContext[]];

interface HyperliquidPerpMeta {
  universe: Array<{
    name: string;
  }>;
}

interface HyperliquidPerpAssetContext {
  prevDayPx: string | number;
  dayNtlVlm: string | number;
  midPx: string | number | null;
  markPx: string | number;
}

type HyperliquidPerpMetaAndAssetCtxs = [HyperliquidPerpMeta, HyperliquidPerpAssetContext[]];

interface ResolvedSpotMarketEntry {
  pairId: string;
  pairSymbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  ctx?: HyperliquidSpotAssetContext;
}

interface HyperliquidInfoClientLike {
  allMids(params?: { dex?: string }): Promise<HyperliquidMidPriceMap>;
  spotMetaAndAssetCtxs(): Promise<HyperliquidSpotMetaAndAssetCtxs>;
  metaAndAssetCtxs(params?: { dex?: string }): Promise<HyperliquidPerpMetaAndAssetCtxs>;
}

function normalizeHyperliquidSpotKey(providerKey: string): string {
  const trimmed = providerKey.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("@")) {
    return trimmed;
  }
  return trimmed.replace(/-/g, "/").toUpperCase();
}

function buildResolvedSpotMarketLookup(
  meta: HyperliquidSpotMeta,
  assetCtxs: HyperliquidSpotAssetContext[],
): Map<string, ResolvedSpotMarketEntry> {
  const tokenNameByIndex = new Map<number, string>();
  for (const token of meta.tokens) {
    tokenNameByIndex.set(token.index, token.name);
  }

  const marketByLookupKey = new Map<string, ResolvedSpotMarketEntry>();
  for (const [index, market] of meta.universe.entries()) {
    const baseTokenName = tokenNameByIndex.get(market.tokens[0] ?? -1);
    const quoteTokenName = tokenNameByIndex.get(market.tokens[1] ?? -1);
    if (!baseTokenName || !quoteTokenName) {
      continue;
    }

    const entry: ResolvedSpotMarketEntry = {
      pairId: String(market.name),
      pairSymbol: `${baseTokenName}/${quoteTokenName}`.toUpperCase(),
      baseSymbol: baseTokenName.toUpperCase(),
      quoteSymbol: quoteTokenName.toUpperCase(),
      ctx: assetCtxs[index],
    };

    marketByLookupKey.set(entry.pairSymbol, entry);
    marketByLookupKey.set(entry.pairId, entry);

    const ctxCoin = entry.ctx?.coin?.toUpperCase();
    if (ctxCoin) {
      marketByLookupKey.set(ctxCoin, entry);
    }
  }

  return marketByLookupKey;
}

function parseFiniteNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeHyperliquidPerpKey(providerKey: string): string {
  return providerKey.trim().toUpperCase();
}

function inferBuilderDexPerpBaseSymbol(providerKey: string): string | undefined {
  const normalized = normalizeHyperliquidPerpKey(providerKey);
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes(":")) {
    return normalized.split(":").at(-1);
  }
  if (normalized.endsWith("-USDC")) {
    return normalized.slice(0, -"-USDC".length);
  }
  if (normalized.endsWith("/USDC")) {
    return normalized.slice(0, -"/USDC".length);
  }
  return normalized;
}

function inferHyperliquidPerpQuoteCurrency(providerKey: string): string {
  const normalized = normalizeHyperliquidPerpKey(providerKey);
  if (normalized.endsWith("-USDC") || normalized.endsWith("/USDC")) {
    return "usdc";
  }
  return "usd";
}

function buildPerpUniverseLookup(meta: HyperliquidPerpMeta): Map<string, number> {
  const indexByKey = new Map<string, number>();
  meta.universe.forEach((asset, index) => {
    const name = String(asset.name ?? "").toUpperCase();
    if (!name) {
      return;
    }
    indexByKey.set(name, index);
    const base = name.includes(":") ? name.split(":").at(-1) : name;
    if (base) {
      indexByKey.set(base, index);
      indexByKey.set(`${base}-USDC`, index);
      indexByKey.set(`${base}/USDC`, index);
    }
  });
  return indexByKey;
}

export function parseHyperliquidPerpMarketSnapshots(input: {
  allMids: HyperliquidMidPriceMap;
  metaAndAssetCtxs: HyperliquidPerpMetaAndAssetCtxs;
  watchlist: WatchlistInstrument[];
  dex?: string;
  capturedAt?: string;
}): MarketSnapshotItem[] {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const [meta, assetCtxs] = input.metaAndAssetCtxs;
  const indexByKey = buildPerpUniverseLookup(meta);
  const normalizedDex = input.dex?.trim();
  const dexUpper = normalizedDex ? normalizedDex.toUpperCase() : undefined;

  return input.watchlist
    .filter((instrument) => instrument.enabled && instrument.provider === "hyperliquid")
    .flatMap((instrument) => {
      const providerKey = normalizeHyperliquidPerpKey(instrument.providerKey);
      const baseSymbol = inferBuilderDexPerpBaseSymbol(providerKey);
      const candidates = new Set<string>([providerKey]);
      if (baseSymbol) {
        candidates.add(baseSymbol);
        candidates.add(`${baseSymbol}-USDC`);
        candidates.add(`${baseSymbol}/USDC`);
        if (dexUpper) {
          candidates.add(`${dexUpper}:${baseSymbol}`);
        }
      }

      let matchedIndex: number | undefined;
      let matchedUniverseName: string | undefined;
      for (const candidate of candidates) {
        const idx = indexByKey.get(candidate);
        if (idx !== undefined) {
          matchedIndex = idx;
          matchedUniverseName = meta.universe[idx]?.name;
          break;
        }
      }
      if (matchedIndex === undefined) {
        return [];
      }

      const ctx = assetCtxs[matchedIndex];
      if (!ctx) {
        return [];
      }

      const midsCandidates = new Set<string>();
      if (matchedUniverseName) {
        midsCandidates.add(matchedUniverseName);
        midsCandidates.add(matchedUniverseName.toUpperCase());
      }
      if (baseSymbol) {
        midsCandidates.add(baseSymbol);
        if (dexUpper) {
          midsCandidates.add(`${dexUpper}:${baseSymbol}`);
        }
      }
      midsCandidates.add(providerKey);
      const midRaw = [...midsCandidates]
        .map((candidate) => input.allMids[candidate])
        .find((value) => value !== undefined) ?? ctx.midPx ?? ctx.markPx;

      const currentPrice = parseFiniteNumber(midRaw);
      if (currentPrice === undefined) {
        throw new ValidationError("Invalid Hyperliquid numeric fields", [
          `Missing/invalid perp mid price for ${instrument.providerKey}`,
        ]);
      }

      const prevDayPx = parseFiniteNumber(ctx.prevDayPx);
      const return24hPct = prevDayPx && prevDayPx > 0 ? ((currentPrice - prevDayPx) / prevDayPx) * 100 : 0;
      const volume24h = parseFiniteNumber(ctx.dayNtlVlm);

      return [
        {
          instrumentId: instrument.id,
          capturedAt,
          currentPrice,
          return24hPct,
          return7dPct: 0,
          volume24h,
          currency: inferHyperliquidPerpQuoteCurrency(instrument.providerKey),
          provider: "hyperliquid",
        } satisfies MarketSnapshotItem,
      ];
    });
}

export function parseHyperliquidSpotMarketSnapshots(input: {
  allMids: HyperliquidMidPriceMap;
  spotMetaAndAssetCtxs: HyperliquidSpotMetaAndAssetCtxs;
  watchlist: WatchlistInstrument[];
  capturedAt?: string;
}): MarketSnapshotItem[] {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const [meta, assetCtxs] = input.spotMetaAndAssetCtxs;

  const marketByLookupKey = buildResolvedSpotMarketLookup(meta, assetCtxs);
  const ctxByCoin = new Map<string, HyperliquidSpotAssetContext>();
  for (const ctx of assetCtxs) {
    if (typeof ctx.coin === "string" && ctx.coin.length > 0) {
      ctxByCoin.set(ctx.coin, ctx);
      ctxByCoin.set(ctx.coin.toUpperCase(), ctx);
    }
  }

  return input.watchlist
    .filter((instrument) => instrument.enabled && instrument.provider === "hyperliquid")
    .flatMap((instrument) => {
      const normalizedKey = normalizeHyperliquidSpotKey(instrument.providerKey);
      const baseSymbol = normalizedKey.startsWith("@") ? undefined : normalizedKey.split("/")[0]?.toUpperCase();
      const resolvedMarket =
        marketByLookupKey.get(normalizedKey) ??
        (baseSymbol ? marketByLookupKey.get(baseSymbol) : undefined);
      if (!resolvedMarket) {
        return [];
      }

      const ctx =
        resolvedMarket.ctx ??
        ctxByCoin.get(resolvedMarket.pairId) ??
        ctxByCoin.get(resolvedMarket.pairSymbol) ??
        ctxByCoin.get(resolvedMarket.baseSymbol) ??
        (baseSymbol ? ctxByCoin.get(baseSymbol) : undefined);
      if (!ctx) {
        return [];
      }

      const midRaw =
        input.allMids[resolvedMarket.pairId] ??
        input.allMids[resolvedMarket.pairSymbol] ??
        input.allMids[resolvedMarket.baseSymbol] ??
        input.allMids[ctx.coin] ??
        input.allMids[String(ctx.coin).toUpperCase()] ??
        ctx.midPx ??
        ctx.markPx;
      const currentPrice = parseFiniteNumber(midRaw);
      if (currentPrice === undefined) {
        throw new ValidationError("Invalid Hyperliquid numeric fields", [
          `Missing/invalid mid price for ${instrument.providerKey}`,
        ]);
      }

      const prevDayPx = parseFiniteNumber(ctx.prevDayPx);
      const return24hPct =
        prevDayPx && prevDayPx > 0 ? ((currentPrice - prevDayPx) / prevDayPx) * 100 : 0;
      const volume24h = parseFiniteNumber(ctx.dayNtlVlm);
      const quoteCurrency = resolvedMarket.quoteSymbol.toLowerCase();

      return [
        {
          instrumentId: instrument.id,
          capturedAt,
          currentPrice,
          return24hPct,
          return7dPct: 0,
          volume24h,
          currency: quoteCurrency,
          provider: "hyperliquid",
        } satisfies MarketSnapshotItem,
      ];
    });
}

export interface HyperliquidClient {
  fetchMarketSnapshots(watchlist: WatchlistInstrument[]): Promise<MarketSnapshotItem[]>;
}

export function createHyperliquidClient(options: {
  infoClient?: HyperliquidInfoClientLike;
  apiUrl?: string;
  isTestnet?: boolean;
  dex?: string;
} = {}): HyperliquidClient {
  const infoClient =
    options.infoClient ??
    new InfoClient({
      transport: new HttpTransport({
        apiUrl: options.apiUrl,
        isTestnet: options.isTestnet,
      }),
    });

  return {
    async fetchMarketSnapshots(watchlist) {
      const hyperliquidWatchlist = watchlist.filter(
        (instrument) => instrument.enabled && instrument.provider === "hyperliquid",
      );
      if (hyperliquidWatchlist.length === 0) {
        return [];
      }

      const dex = options.dex?.trim() || undefined;
      const [mainMids, spotMetaAndAssetCtxs, builderDexPerpData] = await Promise.all([
        infoClient.allMids(),
        infoClient.spotMetaAndAssetCtxs(),
        dex
          ? Promise.all([infoClient.allMids({ dex }), infoClient.metaAndAssetCtxs({ dex })]).then(
              ([allMids, metaAndAssetCtxs]) => ({ allMids, metaAndAssetCtxs }),
            )
          : Promise.resolve(undefined),
      ]);

      const snapshots = [
        ...parseHyperliquidSpotMarketSnapshots({
          allMids: mainMids,
          spotMetaAndAssetCtxs,
          watchlist: hyperliquidWatchlist,
        }),
        ...(builderDexPerpData
          ? parseHyperliquidPerpMarketSnapshots({
              allMids: builderDexPerpData.allMids,
              metaAndAssetCtxs: builderDexPerpData.metaAndAssetCtxs,
              watchlist: hyperliquidWatchlist,
              dex,
            })
          : []),
      ];

      // Prefer later matches (builder dex perps) when the same instrument is resolved twice.
      const snapshotByInstrumentId = new Map<string, MarketSnapshotItem>();
      for (const snapshot of snapshots) {
        snapshotByInstrumentId.set(snapshot.instrumentId, snapshot);
      }
      return [...snapshotByInstrumentId.values()];
    },
  };
}
