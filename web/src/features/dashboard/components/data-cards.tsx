import type { LiveRunState } from "../types";

import {
  etfFlowDirection,
  formatDateTime,
  formatEtfAssetLabel,
  formatUsdMillions,
} from "../utils/formatters";
import { asArray, asString, cx, isRecord } from "../utils/guards";
import {
  computeRecentEtfCumulative,
  getEtfFlowsPayload,
  getEtfRowTotalNetFlowUsdM,
  getMacroPayload,
  getStablecoinSupplyPayload,
  getTopArticlesPayload,
  splitMarketSnapshotRows,
} from "../utils/parsers";
import { Panel } from "./primitives";

export function TopArticlesCard({ state }: { state?: LiveRunState }) {
  const payload = getTopArticlesPayload(state?.sections.topArticles);
  const progress = state?.topArticleProgress;
  const items = payload?.items ?? [];

  return (
    <Panel
      title="Top Articles"
      subtitle="Ranking + progressive summary enrichment"
      actions={
        progress ? (
          <div className="data-pill gap-2">
            <span className="font-mono text-[11px]">
              {progress.completed}/{progress.total}
            </span>
            <span className="text-zinc-400">summaries</span>
          </div>
        ) : undefined
      }
    >
      {progress && progress.total > 0 ? (
        <div className="mb-4">
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-gold-400 transition-[width] duration-300"
              style={{
                width: `${Math.max(4, (progress.completed / progress.total) * 100)}%`,
              }}
            />
          </div>
          {progress.stats ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="data-pill">
                LLM {progress.stats.llmSummaries ?? 0}
              </span>
              <span className="data-pill">
                RSS fallback {progress.stats.fromRssFallback ?? 0}
              </span>
              <span className="data-pill">
                Fetch errors {progress.stats.fetchErrors ?? 0}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {!payload ? (
        <div className="text-sm text-zinc-400">No article ranking yet.</div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-zinc-400">
            {payload.method ? (
              <span className="data-pill">method: {payload.method}</span>
            ) : null}
            <span className="data-pill">items: {items.length}</span>
          </div>
          <div className="space-y-3">
            {items.slice(0, 12).map((item, index) => {
              const rank =
                typeof item.rank === "number" ? item.rank : index + 1;
              const title =
                typeof item.title === "string" ? item.title : "Untitled";
              const source =
                typeof item.source === "string" ? item.source : "source";
              const articleLink =
                typeof item.link === "string" && item.link.trim().length > 0
                  ? item.link.trim()
                  : undefined;
              const articleSummary =
                typeof item.articleSummary === "string"
                  ? item.articleSummary
                  : undefined;
              const rationale =
                typeof item.rationale === "string" ? item.rationale : undefined;
              return (
                <article
                  key={`${rank}-${title}`}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 font-mono text-xs text-cyan-200">
                      {rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium leading-snug text-zinc-100">
                        {articleLink ? (
                          <a
                            href={articleLink}
                            target="_blank"
                            rel="noreferrer"
                            className="transition hover:text-cyan-100 hover:underline decoration-cyan-300/60 underline-offset-2"
                          >
                            {title}
                          </a>
                        ) : (
                          title
                        )}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-400">
                        {source} ·{" "}
                        {typeof item.publishedAt === "string"
                          ? formatDateTime(item.publishedAt)
                          : "n/a"}
                        {articleLink ? (
                          <>
                            {" · "}
                            <a
                              href={articleLink}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-200 transition hover:text-cyan-100 hover:underline"
                            >
                              Open article
                            </a>
                          </>
                        ) : null}
                      </p>
                      {articleSummary ? (
                        <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                          {articleSummary}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-500">
                          Summary pending...
                        </p>
                      )}
                      {rationale ? (
                        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                          {rationale}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}

export function NewsSourcesCard({ state }: { state?: LiveRunState }) {
  const sources = getNewsSourceSummaries(state);

  return (
    <Panel
      title="News Sources"
      subtitle="Sources represented in the current RSS intake"
      actions={
        <div className="data-pill gap-2">
          <span className="font-mono text-[11px]">{sources.length}</span>
          <span className="text-zinc-400">sources</span>
        </div>
      }
    >
      {sources.length === 0 ? (
        <div className="text-sm text-zinc-400">No source data yet.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sources.map((source) => (
            <div
              key={source.name}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2"
            >
              <div className="text-sm font-medium text-zinc-100">{source.name}</div>
              <div className="mt-1 text-xs text-zinc-400">
                {source.articleCount} article{source.articleCount > 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function getNewsSourceSummaries(
  state?: LiveRunState,
): Array<{ name: string; articleCount: number }> {
  const section = state?.sections.news;
  if (!isRecord(section)) {
    return [];
  }

  const bySource = new Map<string, number>();
  for (const feed of asArray(section.byFeed)) {
    if (!isRecord(feed)) {
      continue;
    }
    const source = asString(feed.source);
    if (!source) {
      continue;
    }
    const parsedItems =
      typeof feed.parsedItems === "number" && Number.isFinite(feed.parsedItems)
        ? feed.parsedItems
        : 0;
    bySource.set(source, (bySource.get(source) ?? 0) + parsedItems);
  }

  if (bySource.size === 0) {
    for (const item of asArray(section.preview)) {
      if (!isRecord(item)) {
        continue;
      }
      const source = asString(item.source);
      if (!source) {
        continue;
      }
      bySource.set(source, (bySource.get(source) ?? 0) + 1);
    }
  }

  return [...bySource.entries()]
    .map(([name, articleCount]) => ({ name, articleCount }))
    .sort((left, right) => {
      if (right.articleCount !== left.articleCount) {
        return right.articleCount - left.articleCount;
      }
      return left.name.localeCompare(right.name);
    });
}

function formatUsdCompact(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }

  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatPctCompact(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function MarketSnapshotTable({
  rows,
}: {
  title: string;
  subtitle?: string;
  rows: Array<Record<string, unknown>>;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <div className="overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-zinc-400">
            <tr>
              <th className="px-3 py-2">Ticker</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">24h</th>
              <th className="px-3 py-2">7d</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const ret24h =
                typeof row.return24hPct === "number"
                  ? row.return24hPct
                  : undefined;
              const ret7d =
                typeof row.return7dPct === "number"
                  ? row.return7dPct
                  : undefined;
              return (
                <tr
                  key={`${String(row.instrumentId ?? index)}-${index}`}
                  className="border-t border-white/5"
                >
                  <td className="px-3 py-2.5 text-zinc-200">
                    {String(row.instrumentId ?? "n/a")}
                  </td>
                  <td className="px-3 py-2.5 text-zinc-200">
                    {typeof row.currentPrice === "number"
                      ? row.currentPrice.toLocaleString()
                      : "n/a"}
                  </td>
                  <td
                    className={cx(
                      "px-3 py-2.5",
                      ret24h === undefined
                        ? "text-zinc-400"
                        : ret24h >= 0
                          ? "text-emerald-300"
                          : "text-rose-300",
                    )}
                  >
                    {ret24h !== undefined ? `${ret24h.toFixed(2)}%` : "n/a"}
                  </td>
                  <td
                    className={cx(
                      "px-3 py-2.5",
                      ret7d === undefined
                        ? "text-zinc-400"
                        : ret7d >= 0
                          ? "text-emerald-300"
                          : "text-rose-300",
                    )}
                  >
                    {ret7d !== undefined ? `${ret7d.toFixed(2)}%` : "n/a"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CryptoSnapshotCard({ state }: { state?: LiveRunState }) {
  const { all, crypto } = splitMarketSnapshotRows(state);
  return (
    <Panel title="Crypto Snapshot" subtitle="CoinGecko + Hyperliquid">
      {all.length === 0 ? (
        <div className="text-sm text-zinc-400">Waiting for market data.</div>
      ) : crypto.length === 0 ? (
        <div className="text-sm text-zinc-400">
          No crypto market rows available for this run.
        </div>
      ) : (
        <MarketSnapshotTable
          title="Crypto"
          subtitle="CoinGecko + Hyperliquid (non-commodity instruments)"
          rows={crypto}
        />
      )}
    </Panel>
  );
}

export function CommoditiesSnapshotCard({ state }: { state?: LiveRunState }) {
  const { all, commodities } = splitMarketSnapshotRows(state);
  return (
    <Panel
      title="Commodities Snapshot"
      subtitle="Hyperliquid macro commodity instruments"
    >
      {all.length === 0 ? (
        <div className="text-sm text-zinc-400">Waiting for market data.</div>
      ) : commodities.length === 0 ? (
        <div className="text-sm text-zinc-400">
          No commodity rows available for this run.
        </div>
      ) : (
        <MarketSnapshotTable
          title="Commodities"
          subtitle="Macro commodity instruments"
          rows={commodities}
        />
      )}
    </Panel>
  );
}

export function IndexesSnapshotCard({ state }: { state?: LiveRunState }) {
  const { all, indexes } = splitMarketSnapshotRows(state);
  return (
    <Panel
      title="Indexes Snapshot"
      subtitle="Alpha Vantage Indexes Instruments"
    >
      {all.length === 0 ? (
        <div className="text-sm text-zinc-400">Waiting for market data.</div>
      ) : indexes.length === 0 ? (
        <div className="text-sm text-zinc-400">
          No index rows available for this run.
        </div>
      ) : (
        <MarketSnapshotTable
          title="Indexes"
          subtitle="Alpha Vantage Indexes Instruments"
          rows={indexes}
        />
      )}
    </Panel>
  );
}

export function OtherMarketSnapshotCard({ state }: { state?: LiveRunState }) {
  const { all, other } = splitMarketSnapshotRows(state);
  if (all.length === 0 || other.length === 0) {
    return null;
  }

  return (
    <Panel
      title="Other Market Rows"
      subtitle="Unclassified snapshot rows kept for visibility"
    >
      <MarketSnapshotTable title="Other Instruments" rows={other} />
    </Panel>
  );
}

export function StablecoinSupplyCard({ state }: { state?: LiveRunState }) {
  const payload = getStablecoinSupplyPayload(state?.sections.stablecoinSupply);
  const snapshot = payload?.snapshot;

  return (
    <Panel
      title="Stablecoins Supply Snapshot"
      subtitle="DefiLlama global stablecoin supply deltas"
    >
      {!payload ? (
        <div className="text-sm text-zinc-400">Waiting for on-chain data.</div>
      ) : !payload.available || !snapshot ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm text-zinc-300">
          <div>No stablecoin supply snapshot available for this run.</div>
          {payload.error ? (
            <div className="mt-2 text-xs text-amber-200">{payload.error}</div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">
                Total Supply
              </div>
              <div className="mt-2 text-xl font-semibold text-zinc-100">
                {formatUsdCompact(snapshot.currentSupplyUsd)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">
                24h Change
              </div>
              <div className="mt-2 text-xl font-semibold text-zinc-100">
                {formatUsdCompact(snapshot.change24hUsd)}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {formatPctCompact(snapshot.change24hPct)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="text-xs uppercase tracking-[0.16em] text-zinc-400">
                7d Change
              </div>
              <div className="mt-2 text-xl font-semibold text-zinc-100">
                {formatUsdCompact(snapshot.change7dUsd)}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {formatPctCompact(snapshot.change7dPct)}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
            <div>Captured: {formatDateTime(snapshot.capturedAt)}</div>
            <div>24h reference: {formatDateTime(snapshot.reference24hAt)}</div>
            <div>7d reference: {formatDateTime(snapshot.reference7dAt)}</div>
            <div className="mt-2">
              Source: {snapshot.source ?? "defillama"}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function MacroContextCard({ state }: { state?: LiveRunState }) {
  const rows = getMacroPayload(state?.sections.macroContext);
  return (
    <Panel
      title="Macro Context"
      subtitle="FRED / macro observations used by the regime"
    >
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-400">Waiting for macro context.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={`${String(row.seriesId ?? index)}-${index}`}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-zinc-100">
                    {String(row.label ?? row.seriesId ?? "Series")}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {String(row.seriesId ?? "n/a")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-zinc-100">
                    {typeof row.value === "number" ? row.value : "n/a"}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {String(row.units ?? "")}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function EtfFlowsCard({ state }: { state?: LiveRunState }) {
  const payload = getEtfFlowsPayload(state?.sections.etfFlows);
  const datasets = payload?.snapshot?.datasets ?? [];

  return (
    <Panel
      title="ETF Flows"
      subtitle="Daily flow table with 5D/20D recap and top inflow/outflow leaders"
    >
      {!payload ? (
        <div className="text-sm text-zinc-400">
          Waiting for ETF flow collection.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            {typeof payload.available === "boolean" ? (
              <span
                className={cx(
                  "data-pill border",
                  payload.available
                    ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                    : "border-amber-300/20 bg-amber-400/10 text-amber-100",
                )}
              >
                {payload.available ? "available" : "unavailable"}
              </span>
            ) : null}
            {payload.snapshot?.source ? (
              <span className="data-pill">source: {payload.snapshot.source}</span>
            ) : null}
            {payload.snapshot?.capturedAt ? (
              <span className="data-pill">
                captured: {formatDateTime(payload.snapshot.capturedAt)}
              </span>
            ) : null}
            {payload.snapshot?.datasets ? (
              <span className="data-pill">
                datasets: {payload.snapshot.datasets.length}
              </span>
            ) : null}
          </div>

          {payload.error ? (
            <div className="mb-4 rounded-xl border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              Collection warning: {payload.error}
            </div>
          ) : null}

          {datasets.length === 0 ? (
            <div className="text-sm text-zinc-400">
              No ETF flow snapshot available for this run.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/15">
              {datasets.map((dataset, datasetIndex) => {
                const latestRow = dataset.rows[dataset.rows.length - 1];
                const latestTotal = latestRow
                  ? getEtfRowTotalNetFlowUsdM(latestRow)
                  : null;
                const cumulative5d = computeRecentEtfCumulative(dataset, 5);
                const cumulative20d = computeRecentEtfCumulative(dataset, 20);
                const tickers =
                  dataset.etfTickers.length > 0
                    ? dataset.etfTickers
                    : latestRow
                      ? Object.keys(latestRow.byEtfNetFlowUsdM).sort()
                      : [];
                const latestEntries = latestRow
                  ? tickers.map((ticker) => ({
                      ticker,
                      value:
                        typeof latestRow.byEtfNetFlowUsdM[ticker] === "number" ||
                        latestRow.byEtfNetFlowUsdM[ticker] === null
                          ? latestRow.byEtfNetFlowUsdM[ticker]
                          : null,
                    }))
                  : [];
                const positiveEntries = latestEntries.filter(
                  (entry): entry is { ticker: string; value: number } =>
                    typeof entry.value === "number" && entry.value > 0,
                );
                const negativeEntries = latestEntries.filter(
                  (entry): entry is { ticker: string; value: number } =>
                    typeof entry.value === "number" && entry.value < 0,
                );
                const topInflow = positiveEntries.reduce<
                  { ticker: string; value: number } | undefined
                >(
                  (best, entry) =>
                    !best || entry.value > best.value ? entry : best,
                  undefined,
                );
                const topOutflow = negativeEntries.reduce<
                  { ticker: string; value: number } | undefined
                >(
                  (worst, entry) =>
                    !worst || entry.value < worst.value ? entry : worst,
                  undefined,
                );
                const sortedLatestEntries = [...latestEntries].sort((a, b) => {
                  const aValue =
                    typeof a.value === "number" ? Math.abs(a.value) : -1;
                  const bValue =
                    typeof b.value === "number" ? Math.abs(b.value) : -1;
                  return bValue - aValue;
                });

                return (
                  <section
                    key={`${dataset.asset ?? "dataset"}-${datasetIndex}`}
                    className={cx(
                      "px-4 py-4",
                      datasetIndex > 0 && "border-t border-white/10",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold tracking-wide text-zinc-100">
                          {formatEtfAssetLabel(dataset.asset)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
                          {latestRow ? (
                            <span>Trading day: {latestRow.date}</span>
                          ) : (
                            <span>No parsed rows</span>
                          )}
                          {dataset.pageUrl ? (
                            <a
                              href={dataset.pageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-200 hover:text-cyan-100"
                            >
                              source page
                            </a>
                          ) : null}
                          {dataset.capturedAt ? (
                            <span>
                              dataset capture: {" "}
                              {formatDateTime(dataset.capturedAt)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 text-xs text-zinc-400">
                        {latestEntries.length > 0 ? (
                          <span>ETFs: {latestEntries.length}</span>
                        ) : null}
                        <span>
                          Positive / Negative: {positiveEntries.length}/
                          {negativeEntries.length}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                      <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="bg-black/25 px-3 py-2.5">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                            Net Flow Total
                          </div>
                          <div
                            className={cx(
                              "mt-1 text-sm font-semibold",
                              typeof latestTotal === "number"
                                ? latestTotal >= 0
                                  ? "text-emerald-200"
                                  : "text-rose-200"
                                : "text-zinc-400",
                            )}
                          >
                            {formatUsdMillions(latestTotal)}
                          </div>
                        </div>
                        <div className="bg-black/25 px-3 py-2.5">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                            Cumulative 5D
                          </div>
                          <div
                            className={cx(
                              "mt-1 text-sm font-semibold",
                              typeof cumulative5d === "number"
                                ? cumulative5d >= 0
                                  ? "text-emerald-200"
                                  : "text-rose-200"
                                : "text-zinc-400",
                            )}
                          >
                            {formatUsdMillions(cumulative5d)}
                          </div>
                        </div>
                        <div className="bg-black/25 px-3 py-2.5">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                            Cumulative 20D
                          </div>
                          <div
                            className={cx(
                              "mt-1 text-sm font-semibold",
                              typeof cumulative20d === "number"
                                ? cumulative20d >= 0
                                  ? "text-emerald-200"
                                  : "text-rose-200"
                                : "text-zinc-400",
                            )}
                          >
                            {formatUsdMillions(cumulative20d)}
                          </div>
                        </div>
                        <div className="bg-black/25 px-3 py-2.5">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                            Top Inflow
                          </div>
                          <div className="mt-1 text-sm font-semibold text-zinc-100">
                            {topInflow
                              ? `${topInflow.ticker} · ${formatUsdMillions(topInflow.value)}`
                              : "N/A"}
                          </div>
                        </div>
                        <div className="bg-black/25 px-3 py-2.5">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                            Top Outflow
                          </div>
                          <div className="mt-1 text-sm font-semibold text-zinc-100">
                            {topOutflow
                              ? `${topOutflow.ticker} · ${formatUsdMillions(topOutflow.value)}`
                              : "N/A"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {latestRow ? (
                      <div className="mt-3 overflow-auto rounded-xl border border-white/10 bg-black/10">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-zinc-400">
                            <tr>
                              <th className="px-3 py-2">ETF</th>
                              <th className="px-3 py-2">Day Flow (US$m)</th>
                              <th className="px-3 py-2">Direction</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedLatestEntries.map((entry) => {
                              const direction = etfFlowDirection(entry.value);
                              const isPositive =
                                typeof entry.value === "number" &&
                                entry.value > 0;
                              const isNegative =
                                typeof entry.value === "number" &&
                                entry.value < 0;
                              return (
                                <tr
                                  key={entry.ticker}
                                  className="border-t border-white/5"
                                >
                                  <td className="px-3 py-2.5 font-medium text-zinc-200">
                                    {entry.ticker}
                                  </td>
                                  <td
                                    className={cx(
                                      "px-3 py-2.5 font-mono",
                                      isPositive
                                        ? "text-emerald-200"
                                        : isNegative
                                          ? "text-rose-200"
                                          : "text-zinc-300",
                                    )}
                                  >
                                    {typeof entry.value === "number"
                                      ? entry.value.toFixed(1)
                                      : "N/A"}
                                  </td>
                                  <td
                                    className={cx(
                                      "px-3 py-2.5 capitalize",
                                      isPositive
                                        ? "text-emerald-200"
                                        : isNegative
                                          ? "text-rose-200"
                                          : "text-zinc-400",
                                    )}
                                  >
                                    {direction}
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className="border-t border-white/10 bg-white/[0.02]">
                              <td className="px-3 py-2.5 font-semibold text-zinc-100">
                                Total
                              </td>
                              <td
                                className={cx(
                                  "px-3 py-2.5 font-mono font-semibold",
                                  typeof latestTotal === "number"
                                    ? latestTotal >= 0
                                      ? "text-emerald-200"
                                      : "text-rose-200"
                                    : "text-zinc-300",
                                )}
                              >
                                {typeof latestTotal === "number"
                                  ? latestTotal.toFixed(1)
                                  : "N/A"}
                              </td>
                              <td
                                className={cx(
                                  "px-3 py-2.5 capitalize",
                                  typeof latestTotal === "number"
                                    ? latestTotal >= 0
                                      ? "text-emerald-200"
                                      : "text-rose-200"
                                    : "text-zinc-400",
                                )}
                              >
                                {etfFlowDirection(latestTotal)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
