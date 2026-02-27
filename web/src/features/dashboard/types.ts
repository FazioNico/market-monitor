import type {
  RunReviewSectionKey,
  RunReviewStageKey,
  TriggerType,
} from "../../types";

export type { RunReviewSectionKey, RunReviewStageKey, TriggerType };

export type ConnectionState =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "live"
  | "closed"
  | "error";

export type StageRunStatus = "running" | "completed";

export type LiveRunTerminalStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "skipped_duplicate";

export type DashboardViewKey = "overview" | "news" | "data" | "onchain" | "ops" | "report";

export interface LiveLogLine {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface StageState {
  stage: RunReviewStageKey;
  label: string;
  status: StageRunStatus;
  startedAt?: string;
  completedAt?: string;
  metrics?: Record<string, string | number | boolean | null>;
}

export interface LiveRunState {
  runId: string;
  generatedAt?: string;
  triggerType?: TriggerType;
  lastEventId: number;
  status: LiveRunTerminalStatus;
  stagesOrder: RunReviewStageKey[];
  stages: Partial<Record<RunReviewStageKey, StageState>>;
  sections: Partial<Record<RunReviewSectionKey, unknown>>;
  logs: LiveLogLine[];
  topArticleProgress?: {
    completed: number;
    total: number;
    stats: Record<string, number>;
    item?: unknown;
  };
  completion?: {
    at: string;
    reportStatus?: string;
    reportFilePath?: string;
    reportFileName?: string;
    elapsedMs?: number;
    message?: string;
  };
}

export type SectionReadinessState = "standby" | "running" | "ready";

export type EtfFlowUiRow = {
  date: string;
  totalNetFlowUsdM: number | null;
  byEtfNetFlowUsdM: Record<string, number | null>;
};

export type EtfFlowUiDataset = {
  asset?: string;
  source?: string;
  pageUrl?: string;
  capturedAt?: string;
  etfTickers: string[];
  rows: EtfFlowUiRow[];
};

export type EtfFlowsSectionPayload = {
  available?: boolean;
  error?: string;
  snapshot?: {
    source?: string;
    capturedAt?: string;
    datasets: EtfFlowUiDataset[];
  };
};

export type StablecoinSupplySectionPayload = {
  available?: boolean;
  error?: string;
  snapshot?: {
    source?: string;
    capturedAt?: string;
    currentSupplyUsd?: number;
    change24hUsd?: number;
    change7dUsd?: number;
    change24hPct?: number;
    change7dPct?: number;
    reference24hAt?: string;
    reference7dAt?: string;
  };
};
