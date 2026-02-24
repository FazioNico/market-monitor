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
  lines.push("## 7. Flow & ETF Data");

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

function getOptionalArticleImageUrl(item: NewsReadingPriorityList["items"][number]): string | undefined {
  const raw = item as unknown as Record<string, unknown>;
  const candidateFields = ["imageUrl", "image", "image_url", "thumbnailUrl", "thumbnail", "thumbnail_url"];

  for (const field of candidateFields) {
    const value = raw[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
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

function renderSentimentDetails(sentiment: SentimentAssessment, omissionReasons?: string[]): string[] {
  const lines: string[] = [];

  if (sentiment.status === "complete") {
    lines.push(`- Score: ${sentiment.score ?? "N/A"}`);
    lines.push(`- Method: ${sentiment.method}`);
    lines.push(`- Coherence: ${sentiment.priceActionCoherence}`);
    if (sentiment.narrativeSummary) {
      lines.push(`- Summary: ${sentiment.narrativeSummary}`);
    }
    return lines;
  }

  lines.push(`- Section omitted: ${findOmissionReason(omissionReasons, "sentiment")}.`);
  return lines;
}

function renderOutlookDetails(outlook: OutlookDistribution): string[] {
  return [
    `- Bull: ${outlook.bullPct}%`,
    `- Base: ${outlook.basePct}%`,
    `- Bear: ${outlook.bearPct}%`,
    `- Primary scenario: ${outlook.primaryScenario}`,
    `- Constraint validated: ${outlook.constraintValidated}`,
    `- Justification: ${outlook.justification}`,
  ];
}

function collectMacroObservations(input: Pick<RenderReportInput, "macroContext" | "regime">): MacroSeriesObservation[] {
  const unique = new Map<string, MacroSeriesObservation>();
  for (const observation of [...input.macroContext, ...(input.regime.macroContext ?? [])]) {
    const key = `${observation.seriesId}|${observation.observedAt}|${observation.value}`;
    if (!unique.has(key)) {
      unique.set(key, observation);
    }
  }

  return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function renderExecutiveSummarySection(input: RenderReportInput): string[] {
  const lines: string[] = [];
  const macroObservations = collectMacroObservations(input);
  const flowHighlights =
    input.etfFlows?.datasets
      .map((dataset) => {
        const latestRow = dataset.rows[dataset.rows.length - 1];
        if (!latestRow) {
          return `${dataset.asset.toUpperCase()}: no parsed rows`;
        }
        const latestTotal = getRowTotalNetFlowUsdM(latestRow);
        return `${dataset.asset.toUpperCase()} ${latestRow.date} ${latestTotal === null ? "N/A" : formatUsdMillions(latestTotal)} (${computeFlowStreak(dataset)})`;
      })
      .join("; ") ?? "ETF flow data unavailable";

  lines.push("## 1. Executive Summary");
  lines.push(`- Regime: ${input.regime.label} | ${input.regime.rationale}`);
  if (input.sentiment.status === "complete") {
    lines.push(
      `- Sentiment: score ${input.sentiment.score ?? "N/A"} (${input.sentiment.method}; coherence: ${input.sentiment.priceActionCoherence})`,
    );
  } else {
    lines.push(`- Sentiment: omitted (${findOmissionReason(input.omissionReasons, "sentiment")}).`);
  }
  lines.push(
    `- Outlook: primary ${input.outlook.primaryScenario} (${input.outlook.bullPct}/${input.outlook.basePct}/${input.outlook.bearPct} bull/base/bear).`,
  );
  if (input.positionWording.status === "complete") {
    lines.push(
      `- Positioning: ${input.positionWording.currentBias ?? "N/A"} | horizon ${input.positionWording.timeHorizon ?? "N/A"}.`,
    );
  } else {
    lines.push(`- Positioning: omitted (${findOmissionReason(input.omissionReasons, "position")}).`);
  }
  if (input.topArticlesToRead) {
    lines.push(
      `- News coverage: ${input.topArticlesToRead.items.length} prioritized (${input.topArticlesToRead.method}) from ${input.topArticlesToRead.candidateNewsEvaluated}/${input.topArticlesToRead.totalNewsEvaluated} candidates; raw ingested ${input.newsItems.length}.`,
    );
  } else {
    lines.push(`- News coverage: prioritization unavailable; raw ingested ${input.newsItems.length}.`);
  }
  if (macroObservations.length > 0) {
    const highlights = macroObservations
      .slice(0, 3)
      .map((obs) => `${obs.label}=${obs.value}${obs.units ? ` ${obs.units}` : ""}`)
      .join("; ");
    lines.push(`- Macro highlights: ${highlights}${macroObservations.length > 3 ? "; ..." : ""}`);
  } else {
    lines.push("- Macro highlights: unavailable.");
  }
  lines.push(`- ETF / flow monitor: ${flowHighlights}.`);

  return lines;
}

function renderRegimeAndPositionSection(input: RenderReportInput): string[] {
  const lines: string[] = [];
  lines.push("## 2. Market Regime & Position Wording");
  lines.push("### Market Regime");
  lines.push(`- Label: ${input.regime.label}`);
  lines.push(`- Momentum: ${input.regime.momentumSignal}`);
  lines.push(`- Dispersion: ${input.regime.dispersionSignal}`);
  lines.push(`- Correlation: ${input.regime.correlationSignal}`);
  lines.push(`- Macro: ${input.regime.macroSignal}`);
  lines.push(`- Rationale: ${input.regime.rationale}`);
  lines.push("");
  lines.push("### Position Wording");
  lines.push(renderPositionWording(input.positionWording, input.omissionReasons));
  return lines;
}

function renderRiskSentimentSection(input: RenderReportInput): string[] {
  const lines: string[] = [];
  lines.push("## 3. Risk & Invalidation / Sentiment Score");
  lines.push("### Sentiment Score");
  lines.push(...renderSentimentDetails(input.sentiment, input.omissionReasons));
  lines.push("");
  lines.push("### Risk & Invalidation");
  lines.push(`- Invalidation conditions: ${input.riskInvalidation.invalidationConditions.join("; ")}`);
  lines.push(`- Key price thresholds: ${input.riskInvalidation.keyPriceThresholds.join("; ")}`);
  lines.push(`- Critical macro events: ${input.riskInvalidation.criticalMacroEvents.join("; ")}`);
  return lines;
}

function renderTacticalOutlookSection(input: RenderReportInput): string[] {
  const lines: string[] = [];
  lines.push("## 4. Tactical Positioning & Probabilistic Outlook");
  lines.push("### Tactical Positioning");

  if (input.positionWording.status === "complete") {
    lines.push(`- Current bias: ${input.positionWording.currentBias ?? "N/A"}`);
    lines.push(`- Scenario alignment: ${input.outlook.primaryScenario}`);
    lines.push(`- Time horizon: ${input.positionWording.timeHorizon ?? "N/A"}`);
    lines.push(
      `- Conditions to increase exposure: ${(input.positionWording.addExposureConditions ?? []).join("; ") || "N/A"}`,
    );
    lines.push(
      `- Conditions to reduce exposure: ${(input.positionWording.reduceExposureConditions ?? []).join("; ") || "N/A"}`,
    );
    lines.push(`- No-trade zones: ${(input.positionWording.noTradeZones ?? []).join("; ") || "N/A"}`);
  } else {
    lines.push(`- Section omitted: ${findOmissionReason(input.omissionReasons, "position")}.`);
  }

  lines.push("");
  lines.push("### Probabilistic Outlook");
  lines.push(...renderOutlookDetails(input.outlook));
  return lines;
}

function renderMacroDashboardSection(input: RenderReportInput): string[] {
  const lines: string[] = [];
  const macroObservations = collectMacroObservations(input);

  lines.push("## 5. Macro Dashboard");

  if (macroObservations.length === 0) {
    lines.push("- No macro dashboard data available.");
    return lines;
  }

  lines.push(
    `- Snapshot summary: ${macroObservations.map((obs) => `${obs.label}=${obs.value} (${obs.observedAt})`).join("; ")}`,
  );
  lines.push("");
  lines.push(buildMarkdownTableRow(["Series", "Label", "Value", "Units", "Observed At", "Provider"]));
  lines.push(buildMarkdownTableRow(["---", "---", "---", "---", "---", "---"]));

  for (const observation of macroObservations) {
    lines.push(
      buildMarkdownTableRow([
        observation.seriesId,
        observation.label,
        String(observation.value),
        observation.units ?? "N/A",
        observation.observedAt,
        observation.provider,
      ]),
    );
  }

  return lines;
}

function renderCryptoDashboardSection(marketSnapshot: MarketSnapshotItem[]): string[] {
  const lines: string[] = [];
  const cryptoItems = marketSnapshot.filter((item) => item.provider.toLowerCase().includes("coingecko"));
  const itemsToRender = cryptoItems.length > 0 ? cryptoItems : marketSnapshot;

  lines.push("## 6. Crypto Dashboard");

  if (itemsToRender.length === 0) {
    lines.push("- No crypto dashboard data available.");
    return lines;
  }

  if (cryptoItems.length === 0 && marketSnapshot.length > 0) {
    lines.push("- No explicit crypto provider match found; rendering available market snapshot items.");
  }

  lines.push(`- Instruments tracked: ${itemsToRender.length}`);
  lines.push("");
  lines.push(
    buildMarkdownTableRow([
      "Instrument",
      "Price",
      "Currency",
      "24h",
      "7d",
      "Volume 24h",
      "Provider",
      "Captured At",
    ]),
  );
  lines.push(buildMarkdownTableRow(["---", "---", "---", "---", "---", "---", "---", "---"]));

  for (const item of itemsToRender) {
    lines.push(
      buildMarkdownTableRow([
        item.instrumentId,
        item.currentPrice.toFixed(2),
        item.currency.toUpperCase(),
        formatPct(item.return24hPct),
        formatPct(item.return7dPct),
        item.volume24h === undefined ? "N/A" : String(Math.round(item.volume24h)),
        item.provider,
        item.capturedAt,
      ]),
    );
  }

  return lines;
}

function renderSourcesAndReferencesSection(input: RenderReportInput): string[] {
  const lines: string[] = [];
  const uniqueNewsSources = [...new Set(input.newsItems.map((item) => item.source))];
  const uniqueArticleLinks = [...new Set(input.newsItems.map((item) => item.link))];
  const etfReferencePages = [...new Set((input.etfFlows?.datasets ?? []).map((dataset) => dataset.pageUrl))];

  lines.push("## 9. Sources & References");
  lines.push("### Data Sources");
  lines.push(`- Declared data sources: ${input.dataSources.join(", ") || "N/A"}`);
  lines.push(`- Report generation timestamp: ${input.generatedAt}`);

  if (etfReferencePages.length > 0) {
    lines.push("");
    lines.push("### ETF / Flow Reference Pages");
    for (const pageUrl of etfReferencePages) {
      lines.push(`- ${pageUrl}`);
    }
  }

  lines.push("");
  lines.push("### News / RSS Ingestion References");
  lines.push(
    `> Sources: ${input.newsItems.length} articles from ${uniqueNewsSources.length > 0 ? uniqueNewsSources.join(", ") : "N/A"}`,
  );
  lines.push(`- Unique article links captured: ${uniqueArticleLinks.length}`);

  lines.push("");
  lines.push("### Diagnostics & Omissions");
  if (input.status === "incomplete" && (input.omissionReasons?.length ?? 0) > 0) {
    lines.push(`- Omission reasons: ${input.omissionReasons!.join("; ")}`);
  }
  for (const line of input.diagnostics ?? []) {
    lines.push(`- ${line}`);
  }
  if (input.status !== "incomplete" && (input.diagnostics?.length ?? 0) === 0) {
    lines.push("- No diagnostics recorded.");
  }

  return lines;
}

function renderTopArticlesToReadSection(
  topArticlesToRead: NewsReadingPriorityList | undefined,
  fallbackNewsItems: NewsItem[],
): string[] {
  const lines: string[] = [];
  lines.push("## 8. Top 20 News (scored + classified)");

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
      lines.push(`- Raw extracted articles remain available in the Sources & References section (${fallbackNewsItems.length} items).`);
    }
    return lines;
  }

  for (const item of topArticlesToRead.items) {
    const imageUrl = getOptionalArticleImageUrl(item);

    lines.push("");
    lines.push("---");
    if (imageUrl) {
      lines.push(`![${item.title}](<${imageUrl}>)`);
    }
    lines.push(`[${item.title}](<${item.link}>)`);
    lines.push(
      `[Relevance: ${item.relevanceScore.toFixed(1)}/10 | Sentiment: ${item.sentimentImpact} | Market: ${item.marketImpact} | Horizon: ${item.timeHorizon}]`,
    );
    lines.push(`Behavior: ${item.investorBehaviorImpact}`);
    lines.push(`Source: ${item.source}`);
    lines.push(`Date: ${item.publishedAt.slice(0, 10)}`);
    lines.push("");
    lines.push("Summary:");
    lines.push(item.articleSummary ?? "N/A");
    lines.push("");
    lines.push("Why read:");
    lines.push(item.rationale);
    lines.push("---");
  }

  return lines;
}

export function renderMarketReportMarkdown(input: RenderReportInput): string {
  const lines: string[] = [];

  lines.push("# Market Review");
  lines.push("");
  lines.push("## 0. Metadata");
  lines.push(`- generation timestamp: ${input.generatedAt}`);
  lines.push(`- report status: ${input.status}`);
  lines.push(`- trigger type: ${input.triggerType}`);
  lines.push(`- data source summary: ${input.dataSources.join(", ")}`);
  if (input.status === "incomplete" && (input.omissionReasons?.length ?? 0) > 0) {
    lines.push(`- omission reasons: ${input.omissionReasons!.join("; ")}`);
  }
  lines.push("");

  lines.push(...renderExecutiveSummarySection(input));
  lines.push("");

  lines.push(...renderRegimeAndPositionSection(input));
  lines.push("");

  lines.push(...renderRiskSentimentSection(input));
  lines.push("");

  lines.push(...renderTacticalOutlookSection(input));
  lines.push("");

  lines.push(...renderMacroDashboardSection(input));
  lines.push("");

  lines.push(...renderCryptoDashboardSection(input.marketSnapshot));
  lines.push("");

  lines.push(...renderEtfFlowsSection(input.etfFlows));
  lines.push("");

  lines.push(...renderTopArticlesToReadSection(input.topArticlesToRead, input.newsItems));
  lines.push("");

  lines.push(...renderSourcesAndReferencesSection(input));
  lines.push("");

  const report = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  return `${report}\n`;
}
