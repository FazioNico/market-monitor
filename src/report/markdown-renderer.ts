import type {
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
  diagnostics?: string[];
}

function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
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
    ]),
  );

  for (const item of topArticlesToRead.items) {
    lines.push(
      buildMarkdownTableRow([
        String(item.rank),
        item.source,
        item.publishedAt.slice(0, 10),
        `[${item.title}](<${item.link}>)`,
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
