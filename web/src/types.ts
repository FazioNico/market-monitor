export type TriggerType = "manual" | "scheduled";
export type RunLifecycleStatus = "started" | "success" | "failed" | "skipped_duplicate" | "partial_success";
export type ReportStatus = "complete" | "incomplete";
export type LlmStatus = "not_used" | "success" | "timeout" | "error";

export interface RunListItem {
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

export type RunReviewServiceEvent =
  | {
      type: "run.started";
      runId: string;
      at: string;
      triggerType: TriggerType;
      generatedAt: string;
    }
  | {
      type: "stage.started";
      runId: string;
      at: string;
      stage: RunReviewStageKey;
      label: string;
    }
  | {
      type: "stage.completed";
      runId: string;
      at: string;
      stage: RunReviewStageKey;
      metrics?: Record<string, string | number | boolean | null>;
    }
  | {
      type: "log.message";
      runId: string;
      at: string;
      level: "info" | "warn" | "error";
      message: string;
    }
  | {
      type: "section.updated";
      runId: string;
      at: string;
      section: RunReviewSectionKey;
      payload: unknown;
    }
  | {
      type: "top_articles.item_processed";
      runId: string;
      at: string;
      completed: number;
      total: number;
      item: unknown;
      stats: Record<string, number>;
    }
  | {
      type: "run.skipped_duplicate";
      runId: string;
      at: string;
      scheduleSlotKey?: string;
      message: string;
    }
  | {
      type: "run.completed";
      runId: string;
      at: string;
      reportStatus: ReportStatus;
      reportFilePath: string;
      reportFileName: string;
      elapsedMs: number;
    }
  | {
      type: "run.failed";
      runId: string;
      at: string;
      message: string;
      errorCode: 1 | 2;
    };

export interface RunReviewEventEnvelope {
  id: number;
  runId: string;
  sentAt: string;
  event: RunReviewServiceEvent;
}

