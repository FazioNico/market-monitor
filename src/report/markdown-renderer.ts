import type {
  EtfFlowDataset,
  EtfFlowSnapshot,
  MacroSeriesObservation,
  MarketSnapshotItem,
  NewsReadingPriorityList,
  NewsItem,
  OutlookDistribution,
  PositionWordingBlock,
  RegimeAssessment,
  RiskInvalidationBlock,
  SentimentAssessment,
  TriggerType,
} from "../shared/types";

export interface RenderReportInput {
  generatedAt: string;
  status: "complete" | "incomplete";
  triggerType: TriggerType;
  dataSources: string[];
  omissionReasons?: string[];
  newsItems: NewsItem[];
  marketSnapshot: MarketSnapshotItem[];
  macroContext: MacroSeriesObservation[];
  regime: RegimeAssessment;
  sentiment: SentimentAssessment;
  topArticlesToRead?: NewsReadingPriorityList;
  outlook: OutlookDistribution;
  riskInvalidation: RiskInvalidationBlock;
  positionWording: PositionWordingBlock;
  etfFlows?: EtfFlowSnapshot;
  diagnostics?: string[];
}

function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatUsdMillions(value: number): string {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(1)}m`;
}

function getRowTotalNetFlowUsdM(row: EtfFlowDataset["rows"][number]): number | null {
  if (row.totalNetFlowUsdM !== null) {
    return row.totalNetFlowUsdM;
  }
  const numericValues = Object.values(row.byEtfNetFlowUsdM).filter((value): value is number => typeof value === "number");
  if (numericValues.length === 0) {
    return null;
  }
  return numericValues.reduce((sum, value) => sum + value, 0);
}

function computeRecentCumulativeNetFlow(dataset: EtfFlowDataset, dayCount: number): number | null {
  const totals = dataset.rows
    .map((row) => getRowTotalNetFlowUsdM(row))
    .filter((value): value is number => typeof value === "number")
    .slice(-dayCount);

  if (totals.length === 0) {
    return null;
  }
  return totals.reduce((sum, value) => sum + value, 0);
}

function computeFlowStreak(dataset: EtfFlowDataset): string {
  let direction: "inflow" | "outflow" | undefined;
  let count = 0;

  for (let index = dataset.rows.length - 1; index >= 0; index -= 1) {
    const total = getRowTotalNetFlowUsdM(dataset.rows[index]!);
    if (typeof total !== "number" || total === 0) {
      break;
    }

    const currentDirection = total > 0 ? "inflow" : "outflow";
    if (!direction) {
      direction = currentDirection;
      count = 1;
      continue;
    }

    if (currentDirection !== direction) {
      break;
    }
    count += 1;
  }

  if (!direction || count === 0) {
    return "No active streak";
  }

  return `${count} trading day${count > 1 ? "s" : ""} ${direction}`;
}

function renderEtfFlowDatasetSection(dataset: EtfFlowDataset): string[] {
  const lines: string[] = [];
  const latestRow = dataset.rows[dataset.rows.length - 1];

  lines.push(`### ${dataset.asset.toUpperCase()} Spot ETF Flows (Farside)`);

  if (!latestRow) {
    lines.push("- No rows parsed.");
    return lines;
  }

  const latestTotal = getRowTotalNetFlowUsdM(latestRow);
  const cumulative5d = computeRecentCumulativeNetFlow(dataset, 5);
  const cumulative20d = computeRecentCumulativeNetFlow(dataset, 20);
  const latestEtfEntries = dataset.etfTickers.map((ticker) => ({
    ticker,
    value: latestRow.byEtfNetFlowUsdM[ticker] ?? null,
  }));
  const positiveEntries = latestEtfEntries.filter((entry) => typeof entry.value === "number" && entry.value > 0);
  const negativeEntries = latestEtfEntries.filter((entry) => typeof entry.value === "number" && entry.value < 0);
  const topInflow = positiveEntries.reduce<typeof positiveEntries[number] | undefined>(
    (best, entry) => (!best || (entry.value as number) > (best.value as number) ? entry : best),
    undefined,
  );
  const topOutflow = negativeEntries.reduce<typeof negativeEntries[number] | undefined>(
    (worst, entry) => (!worst || (entry.value as number) < (worst.value as number) ? entry : worst),
    undefined,
  );

  lines.push(`- Source page: ${dataset.pageUrl}`);
  lines.push(`- Latest trading day: ${latestRow.date}`);
  lines.push(`- Net flow total: ${latestTotal === null ? "N/A" : formatUsdMillions(latestTotal)}`);
  lines.push(`- Cumulative 5d: ${cumulative5d === null ? "N/A" : formatUsdMillions(cumulative5d)}`);
  lines.push(`- Cumulative 20d: ${cumulative20d === null ? "N/A" : formatUsdMillions(cumulative20d)}`);
  lines.push(`- Streak: ${computeFlowStreak(dataset)}`);
  lines.push(`- ETFs positive / negative: ${positiveEntries.length} / ${negativeEntries.length}`);
  if (topInflow && typeof topInflow.value === "number") {
    lines.push(`- Top inflow ETF: ${topInflow.ticker} (${formatUsdMillions(topInflow.value)})`);
  }
  if (topOutflow && typeof topOutflow.value === "number") {
    lines.push(`- Top outflow ETF: ${topOutflow.ticker} (${formatUsdMillions(topOutflow.value)})`);
  }

  lines.push("");
  lines.push(buildMarkdownTableRow(["ETF", "Latest Net Flow (US$m)", "Direction"]));
  lines.push(buildMarkdownTableRow(["---", "---", "---"]));
  for (const entry of latestEtfEntries) {
    const direction =
      entry.value === null ? "n/a" : entry.value > 0 ? "inflow" : entry.value < 0 ? "outflow" : "flat";
    lines.push(
      buildMarkdownTableRow([
        entry.ticker,
        entry.value === null ? "N/A" : entry.value.toFixed(1),
        direction,
      ]),
    );
  }
  lines.push(
    buildMarkdownTableRow([
      "Total",
      latestTotal === null ? "N/A" : latestTotal.toFixed(1),
      latestTotal === null ? "n/a" : latestTotal > 0 ? "inflow" : latestTotal < 0 ? "outflow" : "flat",
    ]),
  );

  return lines;
}

function renderEtfFlowsSection(etfFlows: EtfFlowSnapshot | undefined): string[] {
  const lines: string[] = [];
  lines.push("## ETF Flows");

  if (!etfFlows || etfFlows.datasets.length === 0) {
    lines.push("- No ETF flow data available.");
    return lines;
  }

  lines.push(`- Source: ${etfFlows.source} (scraped)`);
  lines.push(`- Captured at: ${etfFlows.capturedAt}`);

  for (const dataset of etfFlows.datasets) {
    lines.push("");
    lines.push(...renderEtfFlowDatasetSection(dataset));
  }

  return lines;
}

function findOmissionReason(omissionReasons: string[] | undefined, keyword: string): string {
  return omissionReasons?.find((reason) => reason.toLowerCase().includes(keyword)) ?? "LLM failure";
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function buildMarkdownTableRow(cells: string[]): string {
  return `| ${cells.map(escapeMarkdownTableCell).join(" | ")} |`;
}

function renderPositionWording(positionWording: PositionWordingBlock, omissionReasons?: string[]): string {
  if (positionWording.status !== "complete") {
    return `Section omitted: ${findOmissionReason(omissionReasons, "position")}.\n`;
  }

  return [
    `- Current bias: ${positionWording.currentBias ?? "N/A"}`,
    `- Conditions to increase exposure: ${(positionWording.addExposureConditions ?? []).join("; ")}`,
    `- Conditions to reduce exposure: ${(positionWording.reduceExposureConditions ?? []).join("; ")}`,
    `- No-trade zones: ${(positionWording.noTradeZones ?? []).join("; ")}`,
    `- Time horizon: ${positionWording.timeHorizon ?? "N/A"}`,
  ].join("\n");
}

function renderTopArticlesToReadSection(
  topArticlesToRead: NewsReadingPriorityList | undefined,
  fallbackNewsItems: NewsItem[],
): string[] {
  const lines: string[] = [];
  lines.push("## Top 20 Articles to Read (Prioritized)");

  if (!topArticlesToRead) {
    lines.push("- Prioritization not available.");
    return lines;
  }

  lines.push(`- Method: ${topArticlesToRead.method}`);
  lines.push(
    `- Universe evaluated: ${topArticlesToRead.totalNewsEvaluated} | Candidate pool: ${topArticlesToRead.candidateNewsEvaluated} | Selected: ${topArticlesToRead.items.length}`,
  );

  for (const note of topArticlesToRead.notes ?? []) {
    lines.push(`- Note: ${note}`);
  }

  if (topArticlesToRead.items.length === 0) {
    lines.push("- No prioritized articles available.");
    if (fallbackNewsItems.length > 0) {
      lines.push(`- Raw extracted articles remain available in the news section (${fallbackNewsItems.length} items).`);
    }
    return lines;
  }

  lines.push("");
  lines.push(
    buildMarkdownTableRow([
      "Rank",
      "Source",
      "Date",
      "Article",
      "Article Summary",
      "Relevance",
      "Sentiment",
      "Market",
      "Behavior",
      "Horizon",
      "Why Read",
    ]),
  );
  lines.push(
    buildMarkdownTableRow([
      "---",
      "---",
      "---",
      "---",
      "---",
      "---",
      "---",
      "---",
      "---",
      "---",
      "---",
    ]),
  );

  for (const item of topArticlesToRead.items) {
    lines.push(
      buildMarkdownTableRow([
        String(item.rank),
        item.source,
        item.publishedAt.slice(0, 10),
        `[${item.title}](<${item.link}>)`,
        item.articleSummary ?? "N/A",
        `${item.relevanceScore.toFixed(1)}/10`,
        item.sentimentImpact,
        item.marketImpact,
        item.investorBehaviorImpact,
        item.timeHorizon,
        item.rationale,
      ]),
    );
  }

  return lines;
}

export function renderMarketReportMarkdown(input: RenderReportInput): string {
  const lines: string[] = [];

  lines.push("# Morning Market Review");
  lines.push("");
  lines.push("## Report Metadata");
  lines.push(`- generation timestamp: ${input.generatedAt}`);
  lines.push(`- report status: ${input.status}`);
  lines.push(`- trigger type: ${input.triggerType}`);
  lines.push(`- data source summary: ${input.dataSources.join(", ")}`);
  if (input.status === "incomplete" && (input.omissionReasons?.length ?? 0) > 0) {
    lines.push(`- omission reasons: ${input.omissionReasons!.join("; ")}`);
  }
  lines.push("");

  lines.push(...renderTopArticlesToReadSection(input.topArticlesToRead, input.newsItems));
  lines.push("");

  lines.push("## Market Snapshot");
  for (const item of input.marketSnapshot) {
    lines.push(
      `- ${item.instrumentId}: ${item.currentPrice.toFixed(2)} ${item.currency.toUpperCase()} | 24h ${formatPct(item.return24hPct)} | 7d ${formatPct(item.return7dPct)}${item.volume24h !== undefined ? ` | vol24h ${Math.round(item.volume24h)}` : ""}`,
    );
  }
  if (input.marketSnapshot.length === 0) {
    lines.push("- No market snapshot data available.");
  }
  lines.push("");

  lines.push(...renderEtfFlowsSection(input.etfFlows));
  lines.push("");

  lines.push("## Regime Detection");
  lines.push(`- Label: ${input.regime.label}`);
  lines.push(`- Momentum: ${input.regime.momentumSignal}`);
  lines.push(`- Dispersion: ${input.regime.dispersionSignal}`);
  lines.push(`- Correlation: ${input.regime.correlationSignal}`);
  lines.push(`- Macro: ${input.regime.macroSignal}`);
  lines.push(`- Rationale: ${input.regime.rationale}`);
  lines.push("");

  lines.push("## Sentiment Scoring");
  if (input.sentiment.status === "complete") {
    lines.push(`- Score: ${input.sentiment.score}`);
    lines.push(`- Method: ${input.sentiment.method}`);
    lines.push(`- Coherence: ${input.sentiment.priceActionCoherence}`);
    if (input.sentiment.narrativeSummary) {
      lines.push(`- Summary: ${input.sentiment.narrativeSummary}`);
    }
  } else {
    lines.push(`- Section omitted: ${findOmissionReason(input.omissionReasons, "sentiment")}.`);
  }
  lines.push("");

  lines.push("## Probabilistic Outlook");
  lines.push(`- Bull: ${input.outlook.bullPct}%`);
  lines.push(`- Base: ${input.outlook.basePct}%`);
  lines.push(`- Bear: ${input.outlook.bearPct}%`);
  lines.push(`- Primary scenario: ${input.outlook.primaryScenario}`);
  lines.push(`- Constraint validated: ${input.outlook.constraintValidated}`);
  lines.push(`- Justification: ${input.outlook.justification}`);
  lines.push("");

  lines.push("## Risk & Invalidation");
  lines.push(`- Invalidation conditions: ${input.riskInvalidation.invalidationConditions.join("; ")}`);
  lines.push(`- Key price thresholds: ${input.riskInvalidation.keyPriceThresholds.join("; ")}`);
  lines.push(`- Critical macro events: ${input.riskInvalidation.criticalMacroEvents.join("; ")}`);
  lines.push("");

  lines.push("## Position Wording");
  lines.push(renderPositionWording(input.positionWording, input.omissionReasons));
  lines.push("");

  lines.push("## Run Notes / Diagnostics");
  if (input.macroContext.length > 0) {
    lines.push(
      `- Macro context: ${input.macroContext
        .map((obs) => `${obs.label}=${obs.value} (${obs.observedAt})`)
        .join("; ")}`,
    );
  }
  for (const line of input.diagnostics ?? []) {
    lines.push(`- ${line}`);
  }
  lines.push("");

  lines.push("## News Summary / RSS Ingestion Summary");
  lines.push(`> Sources: ${input.newsItems.length} articles from ${[...new Set(input.newsItems.map((item) => item.source))].join(", ")}`);
  for (const item of input.newsItems) {
    lines.push(`- [${item.source}] ${item.title} (${item.publishedAt.slice(0, 10)}) [🔗](${item.link})`);
  }
  if (input.newsItems.length === 0) {
    lines.push("- No recent articles in the configured lookback window.");
  }
  lines.push("");

  const report = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  return `${report}\n`;
}
