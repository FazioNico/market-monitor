export type TriggerType = "manual" | "scheduled";

export type RunLifecycleStatus =
  | "started"
  | "success"
  | "failed"
  | "skipped_duplicate"
  | "partial_success";

export type ReportStatus = "complete" | "incomplete";

export type LlmStatus = "not_used" | "success" | "timeout" | "error";

export interface RunLogEntry {
  runId: string;
  triggerType: TriggerType;
  startedAt: string;
  endedAt?: string;
  status: RunLifecycleStatus;
  reportStatus?: ReportStatus;
  reportFilePath?: string;
  llmStatus?: LlmStatus;
  messages: string[];
}

export interface AppEnv {
  reportsDir: string;
  runLogPath: string;
  fredApiKey?: string;
  coingeckoApiKey?: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
}

export interface RuntimePaths {
  cwd: string;
  configDir: string;
  skillsDir: string;
  reportsDir: string;
  logsDir: string;
  runLogPath: string;
  rssFeedsPath: string;
  watchlistPath: string;
}

export interface AppClock {
  now(): Date;
  nowIso(): string;
  localDateLabel(date?: Date): string;
  localTimeLabel(date?: Date): string;
}

export interface AppContext {
  env: AppEnv;
  paths: RuntimePaths;
  clock: AppClock;
}

export interface FeedCatalogEntry {
  category: string;
  source: string;
  url: string;
  enabled: boolean;
  notes?: string;
}

export type AssetClass = "crypto" | "index" | "fx" | "rates" | "commodity";

export interface WatchlistInstrument {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  provider: string;
  providerKey: string;
  volumeRelevant: boolean;
  enabled: boolean;
}

export interface NormalizedNewsItem {
  title: string;
  publishedAt: string;
  source: string;
  summary: string;
  link: string;
  category: string;
  ingestedAt: string;
}

export interface NewsItem extends NormalizedNewsItem {
  fingerprint: string;
}

export interface MarketSnapshotItem {
  instrumentId: string;
  capturedAt: string;
  currentPrice: number;
  return24hPct: number;
  return7dPct: number;
  volume24h?: number;
  currency: string;
  provider: string;
}

export interface MacroSeriesObservation {
  seriesId: string;
  label: string;
  observedAt: string;
  value: number;
  fetchedAt: string;
  provider: "fred";
  units?: string;
}

export interface RegimeAssessment {
  label: "risk_on" | "risk_off" | "transition";
  dispersionSignal: string;
  correlationSignal: string;
  momentumSignal: string;
  macroSignal: string;
  macroContext: MacroSeriesObservation[];
  rationale: string;
}

export interface SentimentAssessment {
  score?: number;
  method: "llm_assisted" | "deterministic";
  narrativeSummary?: string;
  priceActionCoherence: string;
  status: "complete" | "omitted_llm_failure";
}

export interface OutlookDistribution {
  bullPct: number;
  basePct: number;
  bearPct: number;
  primaryScenario: "bull" | "base" | "bear";
  justification: string;
  constraintValidated: boolean;
}

export interface RiskInvalidationBlock {
  invalidationConditions: string[];
  keyPriceThresholds: string[];
  criticalMacroEvents: string[];
}

export interface PositionWordingBlock {
  currentBias?: string;
  addExposureConditions?: string[];
  reduceExposureConditions?: string[];
  noTradeZones?: string[];
  timeHorizon?: string;
  status: "complete" | "omitted_llm_failure";
}

export interface SkillDefinition {
  id: string;
  name: string;
  type: string;
  version: string;
  enabled: boolean;
  bindingType: string;
  bindingTarget: string;
  description: string;
  inputSchema: string;
  outputSchema: string;
  descriptionSection: string;
  inputSection: string;
  outputSection: string;
  usageRulesSection: string;
  filePath: string;
}
