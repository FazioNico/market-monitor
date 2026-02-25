import type { TriggerType } from "../shared/types";

export type RunReviewStageKey =
  | "load_config"
  | "scheduled_lock"
  | "init_run_log"
  | "fetch_rss"
  | "fetch_market_macro"
  | "detect_regime"
  | "analyze_sentiment"
  | "rank_top_articles"
  | "summarize_top_articles"
  | "build_outlook"
  | "build_risk_invalidation"
  | "generate_positioning"
  | "render_report"
  | "validate_report_format"
  | "write_report"
  | "finalize_run_log";

export type RunReviewSectionKey =
  | "config"
  | "news"
  | "marketSnapshot"
  | "macroContext"
  | "etfFlows"
  | "regime"
  | "sentiment"
  | "topArticles"
  | "outlook"
  | "riskInvalidation"
  | "positionWording"
  | "report"
  | "diagnostics";

export interface RunReviewEventBase {
  runId: string;
  at: string;
}

export interface RunReviewLogEvent extends RunReviewEventBase {
  type: "log.message";
  level: "info" | "warn" | "error";
  message: string;
}

export interface RunReviewRunStartedEvent extends RunReviewEventBase {
  type: "run.started";
  triggerType: TriggerType;
  generatedAt: string;
}

export interface RunReviewStageStartedEvent extends RunReviewEventBase {
  type: "stage.started";
  stage: RunReviewStageKey;
  label: string;
}

export interface RunReviewStageCompletedEvent extends RunReviewEventBase {
  type: "stage.completed";
  stage: RunReviewStageKey;
  metrics?: Record<string, string | number | boolean | null>;
}

export interface RunReviewSectionUpdatedEvent extends RunReviewEventBase {
  type: "section.updated";
  section: RunReviewSectionKey;
  payload: unknown;
}

export interface RunReviewTopArticleProgressEvent extends RunReviewEventBase {
  type: "top_articles.item_processed";
  completed: number;
  total: number;
  item: unknown;
  stats: Record<string, number>;
}

export interface RunReviewSkippedDuplicateEvent extends RunReviewEventBase {
  type: "run.skipped_duplicate";
  scheduleSlotKey?: string;
  message: string;
}

export interface RunReviewCompletedEvent extends RunReviewEventBase {
  type: "run.completed";
  reportStatus: "complete" | "incomplete";
  reportFilePath: string;
  reportFileName: string;
  elapsedMs: number;
}

export interface RunReviewFailedEvent extends RunReviewEventBase {
  type: "run.failed";
  message: string;
  errorCode: 1 | 2;
}

export type RunReviewServiceEvent =
  | RunReviewRunStartedEvent
  | RunReviewStageStartedEvent
  | RunReviewStageCompletedEvent
  | RunReviewSectionUpdatedEvent
  | RunReviewTopArticleProgressEvent
  | RunReviewLogEvent
  | RunReviewSkippedDuplicateEvent
  | RunReviewCompletedEvent
  | RunReviewFailedEvent;

export interface RunReviewEventEnvelope {
  id: number;
  runId: string;
  sentAt: string;
  event: RunReviewServiceEvent;
}

