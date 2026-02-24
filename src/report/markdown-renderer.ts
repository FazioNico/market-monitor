import type {
  MacroSeriesObservation,
  MarketSnapshotItem,
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
  outlook: OutlookDistribution;
  riskInvalidation: RiskInvalidationBlock;
  positionWording: PositionWordingBlock;
  diagnostics?: string[];
}

function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function trimToWordLimit(text: string, limit: number): string {
  const matcher = /\S+/g;
  let match: RegExpExecArray | null;
  let count = 0;

  while ((match = matcher.exec(text)) !== null) {
    count += 1;
    if (count >= limit) {
      const endIndex = match.index + match[0].length;
      return `${text.slice(0, endIndex)} …`;
    }
  }

  return text;
}

function findOmissionReason(omissionReasons: string[] | undefined, keyword: string): string {
  return omissionReasons?.find((reason) => reason.toLowerCase().includes(keyword)) ?? "LLM failure";
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

  lines.push("## News Summary / RSS Ingestion Summary");
  lines.push(`- Articles after deduplication: ${input.newsItems.length}`);
  for (const item of input.newsItems.slice(0, 50)) {
    lines.push(`- [${item.source}] ${item.title} (${item.publishedAt.slice(0, 10)}) [🔗](${item.link})`);
  }
  if (input.newsItems.length === 0) {
    lines.push("- No recent articles in the configured lookback window.");
  }
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

  let report = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  if (input.status === "complete" && wordCount(report) > 1200) {
    report = trimToWordLimit(report, 1200);
  }
  return `${report}\n`;
}
