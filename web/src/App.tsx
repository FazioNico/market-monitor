import { useEffect, useState } from "react";

import type {
  RunListItem,
  RunReviewEventEnvelope,
  RunReviewSectionKey,
  RunReviewServiceEvent,
  RunReviewStageKey,
  TriggerType,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3001";

type ConnectionState = "idle" | "connecting" | "reconnecting" | "live" | "closed" | "error";
type StageRunStatus = "running" | "completed";
type LiveRunTerminalStatus = "idle" | "running" | "completed" | "failed" | "skipped_duplicate";
type DashboardViewKey = "overview" | "news" | "data" | "ops" | "report";

interface LiveLogLine {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

interface StageState {
  stage: RunReviewStageKey;
  label: string;
  status: StageRunStatus;
  startedAt?: string;
  completedAt?: string;
  metrics?: Record<string, string | number | boolean | null>;
}

interface LiveRunState {
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

const SECTION_READINESS_ITEMS: Array<{ key: RunReviewSectionKey; label: string }> = [
  { key: "config", label: "Config" },
  { key: "news", label: "News Intake" },
  { key: "marketSnapshot", label: "Market Snapshot" },
  { key: "macroContext", label: "Macro Context" },
  { key: "etfFlows", label: "ETF Flows" },
  { key: "regime", label: "Regime" },
  { key: "sentiment", label: "Sentiment" },
  { key: "topArticles", label: "Top Articles" },
  { key: "outlook", label: "Outlook" },
  { key: "riskInvalidation", label: "Risk Invalidation" },
  { key: "positionWording", label: "Positioning" },
  { key: "diagnostics", label: "Diagnostics" },
  { key: "report", label: "Report" },
];

const DASHBOARD_VIEWS: Array<{ key: DashboardViewKey; label: string; hint: string }> = [
  { key: "overview", label: "Overview", hint: "Live essentials" },
  { key: "news", label: "News", hint: "Top articles / briefing" },
  { key: "data", label: "Data", hint: "Market / macro / ingestion" },
  { key: "ops", label: "Ops", hint: "Timeline + logs" },
  { key: "report", label: "Report", hint: "Final markdown" },
];

const SECTION_STAGE_MAP: Record<RunReviewSectionKey, RunReviewStageKey[]> = {
  config: ["load_config"],
  news: ["fetch_rss"],
  marketSnapshot: ["fetch_market_macro"],
  macroContext: ["fetch_market_macro"],
  etfFlows: ["fetch_market_macro"],
  regime: ["detect_regime"],
  sentiment: ["analyze_sentiment"],
  topArticles: ["rank_top_articles", "summarize_top_articles"],
  outlook: ["build_outlook"],
  riskInvalidation: ["build_risk_invalidation"],
  positionWording: ["generate_positioning"],
  diagnostics: ["render_report"],
  report: ["render_report", "write_report", "finalize_run_log"],
};

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function createInitialLiveRunState(runId: string): LiveRunState {
  return {
    runId,
    lastEventId: 0,
    status: "idle",
    stagesOrder: [],
    stages: {},
    sections: {},
    logs: [],
  };
}

function isTerminalEvent(event: RunReviewServiceEvent): boolean {
  return event.type === "run.completed" || event.type === "run.failed" || event.type === "run.skipped_duplicate";
}

function reduceEnvelope(state: LiveRunState, envelope: RunReviewEventEnvelope): LiveRunState {
  if (envelope.id <= state.lastEventId) {
    return state;
  }

  const event = envelope.event;
  const next: LiveRunState = {
    ...state,
    runId: envelope.runId,
    lastEventId: envelope.id,
  };

  if (event.type === "run.started") {
    next.generatedAt = event.generatedAt;
    next.triggerType = event.triggerType;
    next.status = "running";
    return next;
  }

  if (event.type === "stage.started") {
    const existing = next.stages[event.stage];
    next.status = next.status === "idle" ? "running" : next.status;
    next.stages = {
      ...next.stages,
      [event.stage]: {
        stage: event.stage,
        label: event.label,
        status: "running",
        startedAt: event.at,
        completedAt: existing?.completedAt,
        metrics: existing?.metrics,
      },
    };
    next.stagesOrder = next.stagesOrder.includes(event.stage)
      ? next.stagesOrder
      : [...next.stagesOrder, event.stage];
    return next;
  }

  if (event.type === "stage.completed") {
    const existing = next.stages[event.stage];
    next.stages = {
      ...next.stages,
      [event.stage]: {
        stage: event.stage,
        label: existing?.label ?? event.stage,
        status: "completed",
        startedAt: existing?.startedAt,
        completedAt: event.at,
        metrics: event.metrics,
      },
    };
    next.stagesOrder = next.stagesOrder.includes(event.stage)
      ? next.stagesOrder
      : [...next.stagesOrder, event.stage];
    return next;
  }

  if (event.type === "log.message") {
    next.logs = [...next.logs, { at: event.at, level: event.level, message: event.message }].slice(-300);
    return next;
  }

  if (event.type === "section.updated") {
    next.sections = {
      ...next.sections,
      [event.section]: event.payload,
    };
    return next;
  }

  if (event.type === "top_articles.item_processed") {
    next.topArticleProgress = {
      completed: event.completed,
      total: event.total,
      stats: event.stats,
      item: event.item,
    };
    return next;
  }

  if (event.type === "run.completed") {
    next.status = "completed";
    next.completion = {
      at: event.at,
      reportStatus: event.reportStatus,
      reportFilePath: event.reportFilePath,
      reportFileName: event.reportFileName,
      elapsedMs: event.elapsedMs,
    };
    return next;
  }

  if (event.type === "run.failed") {
    next.status = "failed";
    next.completion = {
      at: event.at,
      message: event.message,
    };
    return next;
  }

  if (event.type === "run.skipped_duplicate") {
    next.status = "skipped_duplicate";
    next.completion = {
      at: event.at,
      message: event.message,
    };
    return next;
  }

  return next;
}

function formatDateTime(value?: string): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function formatDurationMs(ms?: number): string {
  if (!Number.isFinite(ms)) return "n/a";
  const totalSeconds = Math.floor((ms ?? 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function statusTone(status: string): string {
  if (status === "completed" || status === "success") return "text-emerald-300 border-emerald-300/20 bg-emerald-400/10";
  if (status === "failed") return "text-rose-300 border-rose-300/20 bg-rose-400/10";
  if (status === "running" || status === "started") return "text-cyan-200 border-cyan-300/20 bg-cyan-400/10";
  if (status === "partial_success") return "text-amber-200 border-amber-300/20 bg-amber-400/10";
  if (status === "skipped_duplicate") return "text-zinc-300 border-zinc-300/15 bg-white/5";
  return "text-zinc-300 border-white/10 bg-white/5";
}

function levelTone(level: LiveLogLine["level"]): string {
  if (level === "error") return "text-rose-300";
  if (level === "warn") return "text-amber-200";
  return "text-zinc-300";
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type EtfFlowUiRow = {
  date: string;
  totalNetFlowUsdM: number | null;
  byEtfNetFlowUsdM: Record<string, number | null>;
};

type EtfFlowUiDataset = {
  asset?: string;
  source?: string;
  pageUrl?: string;
  capturedAt?: string;
  etfTickers: string[];
  rows: EtfFlowUiRow[];
};

type EtfFlowsSectionPayload = {
  available?: boolean;
  error?: string;
  snapshot?: {
    source?: string;
    capturedAt?: string;
    datasets: EtfFlowUiDataset[];
  };
};

function getEtfFlowsPayload(value: unknown): EtfFlowsSectionPayload | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  let snapshot: EtfFlowsSectionPayload["snapshot"];
  if (isRecord(value.snapshot)) {
    const datasets = asArray(value.snapshot.datasets)
      .map((dataset): EtfFlowUiDataset | undefined => {
        if (!isRecord(dataset)) return undefined;

        const rows = asArray(dataset.rows)
          .map((row): EtfFlowUiRow | undefined => {
            if (!isRecord(row)) return undefined;
            const date = asString(row.date);
            if (!date) return undefined;

            const byEtfNetFlowUsdM: Record<string, number | null> = {};
            if (isRecord(row.byEtfNetFlowUsdM)) {
              for (const [ticker, rawValue] of Object.entries(row.byEtfNetFlowUsdM)) {
                if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
                  byEtfNetFlowUsdM[ticker] = rawValue;
                  continue;
                }
                if (rawValue === null) {
                  byEtfNetFlowUsdM[ticker] = null;
                }
              }
            }

            return {
              date,
              totalNetFlowUsdM:
                typeof row.totalNetFlowUsdM === "number" && Number.isFinite(row.totalNetFlowUsdM)
                  ? row.totalNetFlowUsdM
                  : row.totalNetFlowUsdM === null
                    ? null
                    : null,
              byEtfNetFlowUsdM,
            };
          })
          .filter((row): row is EtfFlowUiRow => Boolean(row));

        return {
          asset: asString(dataset.asset),
          source: asString(dataset.source),
          pageUrl: asString(dataset.pageUrl),
          capturedAt: asString(dataset.capturedAt),
          etfTickers: asStringArray(dataset.etfTickers),
          rows,
        };
      })
      .filter((dataset): dataset is EtfFlowUiDataset => Boolean(dataset));

    snapshot = {
      source: asString(value.snapshot.source),
      capturedAt: asString(value.snapshot.capturedAt),
      datasets,
    };
  }

  return {
    available: asBoolean(value.available),
    error: asString(value.error),
    snapshot,
  };
}

function getTopArticlesPayload(value: unknown): { items: Array<Record<string, unknown>>; method?: string } | undefined {
  if (!isRecord(value)) return undefined;
  const items = asArray(value.items).filter((item): item is Record<string, unknown> => isRecord(item));
  return {
    items,
    method: typeof value.method === "string" ? value.method : undefined,
  };
}

function getMarketSnapshotPayload(value: unknown): Array<Record<string, unknown>> {
  return asArray(value).filter((item): item is Record<string, unknown> => isRecord(item));
}

function getMacroPayload(value: unknown): Array<Record<string, unknown>> {
  return asArray(value).filter((item): item is Record<string, unknown> => isRecord(item));
}

function getReportPayload(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function getRegimePayload(value: unknown):
  | {
      label?: "risk_on" | "risk_off" | "transition" | string;
      rationale?: string;
      dispersionSignal?: string;
      correlationSignal?: string;
      momentumSignal?: string;
      macroSignal?: string;
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  return {
    label: asString(value.label),
    rationale: asString(value.rationale),
    dispersionSignal: asString(value.dispersionSignal),
    correlationSignal: asString(value.correlationSignal),
    momentumSignal: asString(value.momentumSignal),
    macroSignal: asString(value.macroSignal),
  };
}

function getSentimentPayload(value: unknown):
  | {
      score?: number;
      method?: string;
      narrativeSummary?: string;
      priceActionCoherence?: string;
      status?: string;
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  return {
    score: asNumber(value.score),
    method: asString(value.method),
    narrativeSummary: asString(value.narrativeSummary),
    priceActionCoherence: asString(value.priceActionCoherence),
    status: asString(value.status),
  };
}

function getOutlookPayload(value: unknown):
  | {
      bullPct?: number;
      basePct?: number;
      bearPct?: number;
      primaryScenario?: string;
      justification?: string;
      constraintValidated?: boolean;
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  return {
    bullPct: asNumber(value.bullPct),
    basePct: asNumber(value.basePct),
    bearPct: asNumber(value.bearPct),
    primaryScenario: asString(value.primaryScenario),
    justification: asString(value.justification),
    constraintValidated: typeof value.constraintValidated === "boolean" ? value.constraintValidated : undefined,
  };
}

function getPositioningPayload(value: unknown):
  | {
      currentBias?: string;
      addExposureConditions: string[];
      reduceExposureConditions: string[];
      noTradeZones: string[];
      timeHorizon?: string;
      status?: string;
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  return {
    currentBias: asString(value.currentBias),
    addExposureConditions: asStringArray(value.addExposureConditions),
    reduceExposureConditions: asStringArray(value.reduceExposureConditions),
    noTradeZones: asStringArray(value.noTradeZones),
    timeHorizon: asString(value.timeHorizon),
    status: asString(value.status),
  };
}

function getRiskInvalidationPayload(value: unknown):
  | {
      invalidationConditions: string[];
      keyPriceThresholds: string[];
      criticalMacroEvents: string[];
    }
  | undefined {
  if (!isRecord(value)) return undefined;
  return {
    invalidationConditions: asStringArray(value.invalidationConditions),
    keyPriceThresholds: asStringArray(value.keyPriceThresholds),
    criticalMacroEvents: asStringArray(value.criticalMacroEvents),
  };
}

function formatUsdMillions(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(1)} US$m`;
}

function etfFlowDirection(value: number | null | undefined): "inflow" | "outflow" | "flat" | "n/a" {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  if (value > 0) return "inflow";
  if (value < 0) return "outflow";
  return "flat";
}

function getEtfRowTotalNetFlowUsdM(row: EtfFlowUiRow): number | null {
  if (typeof row.totalNetFlowUsdM === "number" && Number.isFinite(row.totalNetFlowUsdM)) {
    return row.totalNetFlowUsdM;
  }
  const values = Object.values(row.byEtfNetFlowUsdM).filter((value): value is number => typeof value === "number");
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

function computeRecentEtfCumulative(dataset: EtfFlowUiDataset, days: number): number | null {
  const rows = dataset.rows.slice(-days);
  if (rows.length === 0) {
    return null;
  }
  const totals = rows
    .map((row) => getEtfRowTotalNetFlowUsdM(row))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (totals.length === 0) {
    return null;
  }
  return totals.reduce((sum, value) => sum + value, 0);
}

function formatEtfAssetLabel(asset?: string): string {
  if (!asset) return "ETF Flows";
  return `${asset.toUpperCase()} Spot ETF Flows`;
}

function ConnectionBadge({ status }: { status: ConnectionState }) {
  const label =
    status === "reconnecting"
      ? "reconnect"
      : status;
  const tone =
    status === "live"
      ? "bg-emerald-400"
      : status === "connecting" || status === "reconnecting"
        ? "bg-cyan-400"
        : status === "error"
          ? "bg-rose-400"
          : "bg-zinc-500";
  return (
    <div className="data-pill gap-2">
      <span className={cx("status-dot", tone)} />
      <span className="font-mono text-[11px] uppercase tracking-[0.2em]">{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={cx("data-pill border", statusTone(status), "capitalize")}>{status.replace(/_/g, " ")}</span>;
}

function Panel({
  title,
  subtitle,
  children,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("panel min-w-0", className)}>
      <header className="panel-header flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm uppercase tracking-[0.22em] text-zinc-100">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-zinc-400">{subtitle}</p> : null}
        </div>
        {actions}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function ViewTabs({
  value,
  onChange,
}: {
  value: DashboardViewKey;
  onChange: (next: DashboardViewKey) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-body">
        <div className="flex flex-wrap gap-2">
          {DASHBOARD_VIEWS.map((view) => {
            const active = value === view.key;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => onChange(view.key)}
                className={cx(
                  "rounded-xl border px-3 py-2 text-left transition",
                  active
                    ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100 shadow-glow"
                    : "border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05]",
                )}
              >
                <div className="text-xs font-medium uppercase tracking-[0.16em]">{view.label}</div>
                <div className="mt-1 text-[11px] text-zinc-400">{view.hint}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getOrderedStages(state?: LiveRunState): StageState[] {
  if (!state) {
    return [];
  }
  return state.stagesOrder.map((stageKey) => state.stages[stageKey]).filter(Boolean) as StageState[];
}

function getSectionReadinessState(
  state: LiveRunState | undefined,
  sectionKey: RunReviewSectionKey,
): "standby" | "running" | "ready" {
  if (!state) {
    return "standby";
  }

  const linkedStages = SECTION_STAGE_MAP[sectionKey] ?? [];
  const hasRunningStage = linkedStages.some((stageKey) => state.stages[stageKey]?.status === "running");
  if (hasRunningStage) {
    return "running";
  }

  return state.sections[sectionKey] !== undefined ? "ready" : "standby";
}

function ActivityOverviewCard({
  state,
  connectionState,
}: {
  state?: LiveRunState;
  connectionState: ConnectionState;
}) {
  if (!state) {
    return (
      <Panel title="Live Activity" subtitle="Live stream summary">
        <div className="text-sm text-zinc-400">Select a run to view activity.</div>
      </Panel>
    );
  }

  const orderedStages = getOrderedStages(state);
  const runningStage = [...orderedStages].reverse().find((stage) => stage.status === "running");
  const latestStage = orderedStages.length > 0 ? orderedStages[orderedStages.length - 1] : undefined;
  const lastIssue = [...state.logs].reverse().find((line) => line.level === "error" || line.level === "warn");
  const recentLogs = state.logs.slice(-6).reverse();
  const completedStages = orderedStages.filter((stage) => stage.status === "completed").length;
  const totalStages = orderedStages.length;

  const metricCards = [
    {
      label: "Connection",
      value: connectionState,
      tone:
        connectionState === "live"
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
          : connectionState === "reconnecting" || connectionState === "connecting"
            ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
            : "border-white/10 bg-white/[0.02] text-zinc-300",
    },
    {
      label: "Current Stage",
      value: runningStage?.label ?? latestStage?.label ?? "Waiting",
      tone: "border-white/10 bg-white/[0.02] text-zinc-100",
    },
    {
      label: "Pipeline",
      value: totalStages > 0 ? `${completedStages}/${totalStages} completed` : "No stage yet",
      tone: "border-white/10 bg-white/[0.02] text-zinc-100",
    },
    {
      label: "Top Articles",
      value:
        state.topArticleProgress && state.topArticleProgress.total > 0
          ? `${state.topArticleProgress.completed}/${state.topArticleProgress.total} summaries`
          : "Pending",
      tone:
        state.topArticleProgress && state.topArticleProgress.total > 0
          ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
          : "border-white/10 bg-white/[0.02] text-zinc-400",
    },
  ] as const;

  return (
    <Panel title="Live Activity" subtitle="Compact cards for monitoring the run without a large empty panel">
      <div className="grid gap-2 sm:grid-cols-2">
        {metricCards.map((card) => (
          <div key={card.label} className={cx("rounded-xl border px-3 py-2.5", card.tone)}>
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">{card.label}</div>
            <div className="mt-1 text-sm font-medium">{card.value}</div>
          </div>
        ))}
      </div>

      {lastIssue ? (
        <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/10 px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-amber-200">Latest Warning/Error</div>
          <div className={cx("mt-1 text-sm", levelTone(lastIssue.level))}>{lastIssue.message}</div>
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-zinc-400">Recent Events</div>
        {recentLogs.length === 0 ? (
          <div className="text-sm text-zinc-500">No notable logs yet.</div>
        ) : (
          <div className="space-y-2">
            {recentLogs.map((line, index) => (
              <div key={`${line.at}-${index}`} className="grid grid-cols-[56px_40px_1fr] gap-2 text-xs">
                <span className="text-zinc-500">{new Date(line.at).toLocaleTimeString("en-US")}</span>
                <span className={cx("uppercase tracking-wide", levelTone(line.level))}>{line.level}</span>
                <span className="text-zinc-300">{line.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

function RegimeSummaryCard({ state }: { state?: LiveRunState }) {
  const regime = getRegimePayload(state?.sections.regime);
  const label = regime?.label ?? "pending";
  const labelText =
    label === "risk_on" ? "Risk On" : label === "risk_off" ? "Risk Off" : label === "transition" ? "Transition" : label;
  const tone =
    label === "risk_on"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : label === "risk_off"
        ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
        : label === "transition"
          ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
          : "border-white/10 bg-white/[0.02] text-zinc-300";

  const signals = [
    { label: "Dispersion", value: regime?.dispersionSignal },
    { label: "Correlation", value: regime?.correlationSignal },
    { label: "Momentum", value: regime?.momentumSignal },
    { label: "Macro", value: regime?.macroSignal },
  ];

  return (
    <Panel title="Regime" subtitle="Executive summary of the current market regime">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("data-pill border", tone, "text-sm font-semibold")}>{labelText}</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {signals.map((signal) => (
          <div key={signal.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">{signal.label}</div>
            <div className="mt-1 text-sm leading-snug text-zinc-200">{signal.value ?? "Pending..."}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Rationale</div>
        <p className="mt-1 text-sm leading-relaxed text-zinc-200">
          {regime?.rationale ?? "The regime rationale will appear here as soon as the analysis is ready."}
        </p>
      </div>
    </Panel>
  );
}

function SentimentSummaryCard({ state }: { state?: LiveRunState }) {
  const sentiment = getSentimentPayload(state?.sections.sentiment);
  const score = sentiment?.score;
  const scorePct = typeof score === "number" ? Math.max(0, Math.min(100, score * 10)) : undefined;
  const scoreTone =
    score === undefined
      ? "border-white/10 bg-white/[0.02] text-zinc-300"
      : score >= 7
        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
        : score >= 4
          ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
          : "border-rose-300/20 bg-rose-400/10 text-rose-100";

  return (
    <Panel title="Sentiment" subtitle="Sentiment readout and price-action coherence">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className={cx("rounded-2xl border px-4 py-3", scoreTone)}>
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Score</div>
          <div className="mt-1 font-display text-2xl font-semibold">
            {typeof score === "number" ? score.toFixed(1) : "--"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            {sentiment?.method ? <span className="data-pill">method: {sentiment.method}</span> : null}
            {sentiment?.status ? <span className="data-pill">status: {sentiment.status}</span> : null}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-300 transition-[width] duration-300"
              style={{ width: `${scorePct ?? 6}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Price Action Coherence</div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-200">
            {sentiment?.priceActionCoherence ?? "Waiting for the coherence assessment."}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Narrative Summary</div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-200">
            {sentiment?.narrativeSummary ?? "The narrative summary will appear here once sentiment is computed."}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function CompactListBlock({
  title,
  items,
  emptyLabel,
  tone = "neutral",
}: {
  title: string;
  items: string[];
  emptyLabel: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "border-emerald-300/15 bg-emerald-400/5"
      : tone === "negative"
        ? "border-rose-300/15 bg-rose-400/5"
        : tone === "warning"
          ? "border-amber-300/15 bg-amber-400/5"
          : "border-white/10 bg-white/[0.02]";

  return (
    <div className={cx("rounded-xl border p-3", toneClass)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">{title}</div>
        <span className="text-xs text-zinc-500">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="mt-2 text-sm text-zinc-500">{emptyLabel}</div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.slice(0, 4).map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-relaxed text-zinc-200">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
              <span>{item}</span>
            </li>
          ))}
          {items.length > 4 ? <li className="text-xs text-zinc-500">+ {items.length - 4} more items</li> : null}
        </ul>
      )}
    </div>
  );
}

function OutlookSummaryCard({ state }: { state?: LiveRunState }) {
  const outlook = getOutlookPayload(state?.sections.outlook);
  const bull = Math.max(0, outlook?.bullPct ?? 0);
  const base = Math.max(0, outlook?.basePct ?? 0);
  const bear = Math.max(0, outlook?.bearPct ?? 0);
  const total = Math.max(1, bull + base + bear);
  const bullW = (bull / total) * 100;
  const baseW = (base / total) * 100;
  const bearW = (bear / total) * 100;
  const primary = outlook?.primaryScenario ?? "pending";
  const primaryText =
    primary === "bull" ? "Bull" : primary === "base" ? "Base" : primary === "bear" ? "Bear" : "Pending";
  const primaryTone =
    primary === "bull"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : primary === "bear"
        ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
        : primary === "base"
          ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
          : "border-white/10 bg-white/[0.02] text-zinc-300";

  return (
    <Panel title="Outlook" subtitle="Scenario probabilities and central rationale">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("data-pill border", primaryTone)}>{primaryText}</span>
        {typeof outlook?.constraintValidated === "boolean" ? (
          <span
            className={cx(
              "data-pill border",
              outlook.constraintValidated
                ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                : "border-amber-300/20 bg-amber-400/10 text-amber-100",
            )}
          >
            {outlook.constraintValidated ? "Constraint validated" : "Constraint pending"}
          </span>
        ) : null}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/20">
        <div className="flex h-3 w-full">
          <div className="bg-emerald-400/70" style={{ width: `${bullW}%` }} />
          <div className="bg-cyan-400/70" style={{ width: `${baseW}%` }} />
          <div className="bg-rose-400/70" style={{ width: `${bearW}%` }} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "Bull", value: outlook?.bullPct, tone: "text-emerald-200" },
          { label: "Base", value: outlook?.basePct, tone: "text-cyan-200" },
          { label: "Bear", value: outlook?.bearPct, tone: "text-rose-200" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">{item.label}</div>
            <div className={cx("mt-1 text-base font-semibold", item.tone)}>
              {typeof item.value === "number" ? `${item.value}%` : "--"}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Executive Rationale</div>
        <p className="mt-1 text-sm leading-relaxed text-zinc-200">
          {outlook?.justification ?? "The outlook rationale will appear here once it is computed."}
        </p>
      </div>
    </Panel>
  );
}

function PositioningSummaryCard({ state }: { state?: LiveRunState }) {
  const positioning = getPositioningPayload(state?.sections.positionWording);
  const status = positioning?.status ?? "pending";
  const statusTone =
    status === "complete"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : status.includes("omitted")
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : "border-white/10 bg-white/[0.02] text-zinc-300";

  return (
    <Panel title="Positioning" subtitle="Execution framework and exposure rules">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("data-pill border", statusTone)}>{status.replace(/_/g, " ")}</span>
        {positioning?.timeHorizon ? <span className="data-pill">{positioning.timeHorizon}</span> : null}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Current Bias</div>
        <p className="mt-1 text-sm leading-relaxed text-zinc-100">
          {positioning?.currentBias ?? "Positioning bias is not available yet."}
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        <CompactListBlock
          title="Add Exposure"
          items={positioning?.addExposureConditions ?? []}
          emptyLabel="No add-exposure conditions yet."
          tone="positive"
        />
        <CompactListBlock
          title="Reduce Exposure"
          items={positioning?.reduceExposureConditions ?? []}
          emptyLabel="No reduce-exposure conditions yet."
          tone="warning"
        />
        <CompactListBlock
          title="No Trade Zones"
          items={positioning?.noTradeZones ?? []}
          emptyLabel="No no-trade zones defined."
          tone="negative"
        />
      </div>
    </Panel>
  );
}

function RiskInvalidationSummaryCard({ state }: { state?: LiveRunState }) {
  const risk = getRiskInvalidationPayload(state?.sections.riskInvalidation);
  const totalTriggers =
    (risk?.invalidationConditions.length ?? 0) +
    (risk?.keyPriceThresholds.length ?? 0) +
    (risk?.criticalMacroEvents.length ?? 0);

  return (
    <Panel title="Risk Invalidation" subtitle="Triggers to monitor that invalidate the current scenario">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="data-pill border border-amber-300/20 bg-amber-400/10 text-amber-100">
          {totalTriggers} trigger{totalTriggers > 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid gap-2">
        <CompactListBlock
          title="Invalidation Conditions"
          items={risk?.invalidationConditions ?? []}
          emptyLabel="No invalidation conditions yet."
          tone="warning"
        />
        <CompactListBlock
          title="Key Price Thresholds"
          items={risk?.keyPriceThresholds ?? []}
          emptyLabel="No critical price thresholds yet."
          tone="neutral"
        />
        <CompactListBlock
          title="Critical Macro Events"
          items={risk?.criticalMacroEvents ?? []}
          emptyLabel="No critical macro events yet."
          tone="negative"
        />
      </div>
    </Panel>
  );
}

function TimelineCard({
  state,
  compact = false,
}: {
  state?: LiveRunState;
  compact?: boolean;
}) {
  if (!state) {
    return <Panel title="Pipeline Timeline">Select a run to open the stream.</Panel>;
  }

  const orderedStages = getOrderedStages(state);
  return (
    <Panel title="Pipeline Timeline" subtitle="Pipeline stages completed progressively through streaming">
      {orderedStages.length === 0 ? (
        <div className="text-sm text-zinc-400">No events received for this run yet (not started, or historical CLI run without event log).</div>
      ) : (
        <ol className={cx("space-y-3", compact && "max-h-[26rem] overflow-auto pr-1")}>
          {orderedStages.map((stage) => (
            <li
              key={stage.stage}
              className={cx("relative rounded-xl border border-white/10 bg-white/[0.02] p-3", compact && "p-2.5")}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      "h-2.5 w-2.5 rounded-full",
                      stage.status === "completed" ? "bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.6)]" : "bg-cyan-300",
                    )}
                  />
                  <span className="text-sm font-medium text-zinc-100">{stage.label}</span>
                </div>
                <StatusBadge status={stage.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
                <span>{formatDateTime(stage.startedAt)}</span>
                {stage.completedAt ? <span>→ {formatDateTime(stage.completedAt)}</span> : null}
              </div>
              {stage.metrics ? (
                <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-zinc-300">
                  {prettyJson(stage.metrics)}
                </pre>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function LogsCard({ state }: { state?: LiveRunState }) {
  const rows = state?.logs ?? [];
  return (
    <Panel title="Live Logs" subtitle="System messages and non-fatal errors">
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-400">No logs yet.</div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-xs">
          {rows.map((line, index) => (
            <div key={`${line.at}-${index}`} className="grid grid-cols-[88px_50px_1fr] gap-2">
              <span className="text-zinc-500">{new Date(line.at).toLocaleTimeString("en-US")}</span>
              <span className={cx("uppercase tracking-wide", levelTone(line.level))}>{line.level}</span>
              <span className="text-zinc-300">{line.message}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function TopArticlesCard({ state }: { state?: LiveRunState }) {
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
            <span className="font-mono text-[11px]">{progress.completed}/{progress.total}</span>
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
              style={{ width: `${Math.max(4, (progress.completed / progress.total) * 100)}%` }}
            />
          </div>
          {progress.stats ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="data-pill">LLM {progress.stats.llmSummaries ?? 0}</span>
              <span className="data-pill">RSS fallback {progress.stats.fromRssFallback ?? 0}</span>
              <span className="data-pill">Fetch errors {progress.stats.fetchErrors ?? 0}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {!payload ? (
        <div className="text-sm text-zinc-400">No article ranking yet.</div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-zinc-400">
            {payload.method ? <span className="data-pill">method: {payload.method}</span> : null}
            <span className="data-pill">items: {items.length}</span>
          </div>
          <div className="space-y-3">
            {items.slice(0, 12).map((item, index) => {
              const rank = typeof item.rank === "number" ? item.rank : index + 1;
              const title = typeof item.title === "string" ? item.title : "Untitled";
              const source = typeof item.source === "string" ? item.source : "source";
              const articleSummary = typeof item.articleSummary === "string" ? item.articleSummary : undefined;
              const rationale = typeof item.rationale === "string" ? item.rationale : undefined;
              return (
                <article key={`${rank}-${title}`} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 font-mono text-xs text-cyan-200">
                      {rank}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium leading-snug text-zinc-100">{title}</h3>
                      <p className="mt-1 text-xs text-zinc-400">
                        {source} · {typeof item.publishedAt === "string" ? formatDateTime(item.publishedAt) : "n/a"}
                      </p>
                      {articleSummary ? (
                        <p className="mt-2 text-sm leading-relaxed text-zinc-200">{articleSummary}</p>
                      ) : (
                        <p className="mt-2 text-sm text-zinc-500">Summary pending...</p>
                      )}
                      {rationale ? <p className="mt-2 text-xs leading-relaxed text-zinc-400">{rationale}</p> : null}
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

function MarketSnapshotCard({ state }: { state?: LiveRunState }) {
  const rows = getMarketSnapshotPayload(state?.sections.marketSnapshot);
  return (
    <Panel title="Market Snapshot" subtitle="Price, performance, and provider">
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-400">Waiting for market data.</div>
      ) : (
        <div className="overflow-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-zinc-400">
              <tr>
                <th className="px-3 py-2">Instrument</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">24h</th>
                <th className="px-3 py-2">7j</th>
                <th className="px-3 py-2">Provider</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((row, index) => {
                const ret24h = typeof row.return24hPct === "number" ? row.return24hPct : undefined;
                const ret7d = typeof row.return7dPct === "number" ? row.return7dPct : undefined;
                return (
                  <tr key={`${String(row.instrumentId ?? index)}-${index}`} className="border-t border-white/5">
                    <td className="px-3 py-2 text-zinc-200">{String(row.instrumentId ?? "n/a")}</td>
                    <td className="px-3 py-2 text-zinc-200">
                      {typeof row.currentPrice === "number" ? row.currentPrice.toLocaleString() : "n/a"}
                    </td>
                    <td className={cx("px-3 py-2", ret24h !== undefined && ret24h >= 0 ? "text-emerald-300" : "text-rose-300")}>
                      {ret24h !== undefined ? `${ret24h.toFixed(2)}%` : "n/a"}
                    </td>
                    <td className={cx("px-3 py-2", ret7d !== undefined && ret7d >= 0 ? "text-emerald-300" : "text-rose-300")}>
                      {ret7d !== undefined ? `${ret7d.toFixed(2)}%` : "n/a"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{String(row.provider ?? "n/a")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function MacroContextCard({ state }: { state?: LiveRunState }) {
  const rows = getMacroPayload(state?.sections.macroContext);
  return (
    <Panel title="Macro Context" subtitle="FRED / macro observations used by the regime">
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-400">Waiting for macro context.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`${String(row.seriesId ?? index)}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-zinc-100">{String(row.label ?? row.seriesId ?? "Series")}</div>
                  <div className="text-xs text-zinc-400">{String(row.seriesId ?? "n/a")}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-zinc-100">{typeof row.value === "number" ? row.value : "n/a"}</div>
                  <div className="text-xs text-zinc-400">{String(row.units ?? "")}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function EtfFlowsCard({ state }: { state?: LiveRunState }) {
  const payload = getEtfFlowsPayload(state?.sections.etfFlows);
  const datasets = payload?.snapshot?.datasets ?? [];

  return (
    <Panel title="ETF Flows" subtitle="Daily flow table with 5D/20D recap and top inflow/outflow leaders">
      {!payload ? (
        <div className="text-sm text-zinc-400">Waiting for ETF flow collection.</div>
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
            {payload.snapshot?.source ? <span className="data-pill">source: {payload.snapshot.source}</span> : null}
            {payload.snapshot?.capturedAt ? (
              <span className="data-pill">captured: {formatDateTime(payload.snapshot.capturedAt)}</span>
            ) : null}
            {payload.snapshot?.datasets ? (
              <span className="data-pill">datasets: {payload.snapshot.datasets.length}</span>
            ) : null}
          </div>

            {payload.error ? (
            <div className="mb-4 rounded-xl border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              Collection warning: {payload.error}
            </div>
          ) : null}

          {datasets.length === 0 ? (
            <div className="text-sm text-zinc-400">No ETF flow snapshot available for this run.</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/15">
              {datasets.map((dataset, datasetIndex) => {
                const latestRow = dataset.rows[dataset.rows.length - 1];
                const latestTotal = latestRow ? getEtfRowTotalNetFlowUsdM(latestRow) : null;
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
                        typeof latestRow.byEtfNetFlowUsdM[ticker] === "number" || latestRow.byEtfNetFlowUsdM[ticker] === null
                          ? latestRow.byEtfNetFlowUsdM[ticker]
                          : null,
                    }))
                  : [];
                const positiveEntries = latestEntries.filter(
                  (entry): entry is { ticker: string; value: number } => typeof entry.value === "number" && entry.value > 0,
                );
                const negativeEntries = latestEntries.filter(
                  (entry): entry is { ticker: string; value: number } => typeof entry.value === "number" && entry.value < 0,
                );
                const topInflow = positiveEntries.reduce<{ ticker: string; value: number } | undefined>(
                  (best, entry) => (!best || entry.value > best.value ? entry : best),
                  undefined,
                );
                const topOutflow = negativeEntries.reduce<{ ticker: string; value: number } | undefined>(
                  (worst, entry) => (!worst || entry.value < worst.value ? entry : worst),
                  undefined,
                );
                const sortedLatestEntries = [...latestEntries].sort((a, b) => {
                  const aValue = typeof a.value === "number" ? Math.abs(a.value) : -1;
                  const bValue = typeof b.value === "number" ? Math.abs(b.value) : -1;
                  return bValue - aValue;
                });

                return (
                  <section
                    key={`${dataset.asset ?? "dataset"}-${datasetIndex}`}
                    className={cx("px-4 py-4", datasetIndex > 0 && "border-t border-white/10")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold tracking-wide text-zinc-100">
                          {formatEtfAssetLabel(dataset.asset)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
                          {latestRow ? <span>Trading day: {latestRow.date}</span> : <span>No parsed rows</span>}
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
                          {dataset.capturedAt ? <span>dataset capture: {formatDateTime(dataset.capturedAt)}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 text-xs text-zinc-400">
                        {latestEntries.length > 0 ? <span>ETFs: {latestEntries.length}</span> : null}
                        <span>
                          Positive / Negative: {positiveEntries.length}/{negativeEntries.length}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                      <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="bg-black/25 px-3 py-2.5">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Net Flow Total</div>
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
                          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Cumulative 5D</div>
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
                          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Cumulative 20D</div>
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
                          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Top Inflow</div>
                          <div className="mt-1 text-sm font-semibold text-zinc-100">
                            {topInflow ? `${topInflow.ticker} · ${formatUsdMillions(topInflow.value)}` : "N/A"}
                          </div>
                        </div>
                        <div className="bg-black/25 px-3 py-2.5">
                          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Top Outflow</div>
                          <div className="mt-1 text-sm font-semibold text-zinc-100">
                            {topOutflow ? `${topOutflow.ticker} · ${formatUsdMillions(topOutflow.value)}` : "N/A"}
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
                              const isPositive = typeof entry.value === "number" && entry.value > 0;
                              const isNegative = typeof entry.value === "number" && entry.value < 0;
                              return (
                                <tr key={entry.ticker} className="border-t border-white/5">
                                  <td className="px-3 py-2.5 font-medium text-zinc-200">{entry.ticker}</td>
                                  <td
                                    className={cx(
                                      "px-3 py-2.5 font-mono",
                                      isPositive ? "text-emerald-200" : isNegative ? "text-rose-200" : "text-zinc-300",
                                    )}
                                  >
                                    {typeof entry.value === "number" ? entry.value.toFixed(1) : "N/A"}
                                  </td>
                                  <td
                                    className={cx(
                                      "px-3 py-2.5 capitalize",
                                      isPositive ? "text-emerald-200" : isNegative ? "text-rose-200" : "text-zinc-400",
                                    )}
                                  >
                                    {direction}
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className="border-t border-white/10 bg-white/[0.02]">
                              <td className="px-3 py-2.5 font-semibold text-zinc-100">Total</td>
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
                                {typeof latestTotal === "number" ? latestTotal.toFixed(1) : "N/A"}
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

function JsonSectionCard({
  title,
  subtitle,
  payload,
  maxHeight = "max-h-80",
}: {
  title: string;
  subtitle?: string;
  payload: unknown;
  maxHeight?: string;
}) {
  return (
    <Panel title={title} subtitle={subtitle}>
      {payload === undefined ? (
        <div className="text-sm text-zinc-400">Pending...</div>
      ) : (
        <pre className={cx("overflow-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-300", maxHeight)}>
          {prettyJson(payload)}
        </pre>
      )}
    </Panel>
  );
}

function RunListPanel({
  runs,
  selectedRunId,
  onSelect,
  onRefresh,
  loading,
}: {
  runs: RunListItem[];
  selectedRunId?: string;
  onSelect: (runId: string) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <Panel
      title="Runs"
      subtitle="History from run-log (CLI + Web)"
      actions={
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.06]"
        >
          {loading ? "Refresh..." : "Refresh"}
        </button>
      }
      className="h-full lg:max-h-[calc(100vh-24rem)]"
    >
      <div className="space-y-2 lg:max-h-[calc(100vh-31rem)] lg:overflow-auto lg:pr-1">
        {runs.length === 0 ? (
          <div className="text-sm text-zinc-400">No runs found.</div>
        ) : (
          runs.map((run) => (
            <button
              key={`${run.runId}-${run.startedAt}`}
              type="button"
              onClick={() => onSelect(run.runId)}
              className={cx(
                "w-full rounded-xl border px-3 py-3 text-left transition",
                selectedRunId === run.runId
                  ? "border-cyan-300/30 bg-cyan-400/10 shadow-glow"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-zinc-200">{run.runId}</span>
                <StatusBadge status={run.status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                <span>{run.triggerType}</span>
                <span className="text-right">{formatDateTime(run.startedAt)}</span>
              </div>
              {run.reportStatus ? <div className="mt-2 text-xs text-zinc-400">report: {run.reportStatus}</div> : null}
            </button>
          ))
        )}
      </div>
    </Panel>
  );
}

function ControlsPanel({
  onStartRun,
  starting,
  connectionState,
  launchDisabled,
  launchDisabledReason,
}: {
  onStartRun: (input: { triggerType: TriggerType; dateOverride?: string; scheduleSlotKey?: string }) => Promise<void>;
  starting: boolean;
  connectionState: ConnectionState;
  launchDisabled: boolean;
  launchDisabledReason?: string;
}) {
  const [triggerType, setTriggerType] = useState<TriggerType>("manual");
  const [dateOverride, setDateOverride] = useState("");
  const [scheduleSlotKey, setScheduleSlotKey] = useState("");

  return (
    <Panel
      title="Control Surface"
      subtitle="Start a run and follow section updates live"
      actions={<ConnectionBadge status={connectionState} />}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onStartRun({
            triggerType,
            dateOverride: dateOverride.trim() || undefined,
            scheduleSlotKey: scheduleSlotKey.trim() || undefined,
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-zinc-400">Trigger</span>
            <select
              value={triggerType}
              onChange={(event) => setTriggerType(event.target.value as TriggerType)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300/40"
            >
              <option value="manual">manual</option>
              <option value="scheduled">scheduled</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-zinc-400">Date override</span>
            <input
              type="date"
              value={dateOverride}
              onChange={(event) => setDateOverride(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300/40"
            />
          </label>
        </div>
        {triggerType === "scheduled" ? (
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-zinc-400">Schedule slot key</span>
            <input
              value={scheduleSlotKey}
              onChange={(event) => setScheduleSlotKey(event.target.value)}
              placeholder="2026-02-25T08:00"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-300/40"
            />
          </label>
        ) : null}
        <button
          type="submit"
          disabled={starting || launchDisabled}
          className={cx(
            "relative inline-flex w-full items-center justify-center overflow-hidden rounded-xl border px-4 py-2.5 text-sm font-medium transition",
            starting || launchDisabled
              ? "cursor-not-allowed border-white/10 bg-white/[0.03] text-zinc-500"
              : "border-cyan-300/25 bg-gradient-to-r from-cyan-400/20 to-steel-400/20 text-cyan-100 hover:from-cyan-400/25 hover:to-gold-400/20",
          )}
        >
          {!starting && !launchDisabled ? (
            <span className="pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_right,transparent,black,transparent)] animate-sweep bg-gradient-to-r from-transparent via-white to-transparent" />
          ) : null}
          <span className="relative">
            {starting ? "Starting..." : launchDisabled ? "Run in progress..." : "Start run"}
          </span>
        </button>
      </form>
      {launchDisabledReason ? (
        <p className="mt-3 rounded-lg border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
          {launchDisabledReason}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-zinc-400">
        API target: <span className="font-mono text-zinc-300">{API_BASE}</span>
      </p>
    </Panel>
  );
}

export default function App() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [activeRunIds, setActiveRunIds] = useState<string[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [liveRunState, setLiveRunState] = useState<LiveRunState>();
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [activeView, setActiveView] = useState<DashboardViewKey>("overview");
  const [startingRun, setStartingRun] = useState(false);
  const [uiError, setUiError] = useState<string>();

  async function refreshRuns(): Promise<void> {
    setRunsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/runs`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as { items?: RunListItem[]; activeRunIds?: string[] };
      const items = Array.isArray(data.items) ? data.items : [];
      const nextActiveRunIds = Array.isArray(data.activeRunIds)
        ? data.activeRunIds.filter((value): value is string => typeof value === "string" && value.length > 0)
        : [];
      setRuns(items);
      setActiveRunIds(nextActiveRunIds);
      setSelectedRunId((current) => current ?? items[0]?.runId);
      setUiError(undefined);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunsLoading(false);
    }
  }

  async function startRun(input: {
    triggerType: TriggerType;
    dateOverride?: string;
    scheduleSlotKey?: string;
  }): Promise<void> {
    setStartingRun(true);
    try {
      const response = await fetch(`${API_BASE}/api/runs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }
        if (response.status === 409 && isRecord(payload)) {
          const activeRunId = typeof payload.activeRunId === "string" ? payload.activeRunId : undefined;
          const activeIds = Array.isArray(payload.activeRunIds)
            ? payload.activeRunIds.filter((value): value is string => typeof value === "string")
            : activeRunId
              ? [activeRunId]
              : [];
          if (activeIds.length > 0) {
            setActiveRunIds(activeIds);
          }
          if (activeRunId) {
            setSelectedRunId(activeRunId);
          }
          throw new Error("A run is already in progress. Wait for it to finish before starting another one.");
        }
        const fallback = isRecord(payload) && typeof payload.error === "string" ? payload.error : undefined;
        throw new Error(fallback ?? `HTTP ${response.status}`);
      }
      const data = (await response.json()) as { runId?: string };
      if (!data.runId) {
        throw new Error("runId missing in response");
      }
      setActiveRunIds([data.runId]);
      setSelectedRunId(data.runId);
      setLiveRunState(createInitialLiveRunState(data.runId));
      setConnectionState("connecting");
      await refreshRuns();
    } catch (error) {
      setUiError(error instanceof Error ? error.message : String(error));
    } finally {
      setStartingRun(false);
    }
  }

  useEffect(() => {
    void refreshRuns();
    const handle = setInterval(() => {
      void refreshRuns();
    }, 15_000);
    return () => clearInterval(handle);
  }, []);

  useEffect(() => {
    if (!selectedRunId) {
      setLiveRunState(undefined);
      setConnectionState("idle");
      return;
    }

    setLiveRunState(createInitialLiveRunState(selectedRunId));
    setConnectionState("connecting");

    const source = new EventSource(`${API_BASE}/api/runs/${encodeURIComponent(selectedRunId)}/events`);
    let terminalSeen = false;

    const onRunEvent = (message: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(message.data) as RunReviewEventEnvelope;
        setLiveRunState((current) => reduceEnvelope(current ?? createInitialLiveRunState(selectedRunId), envelope));
        if (isTerminalEvent(envelope.event)) {
          terminalSeen = true;
          setActiveRunIds((current) => current.filter((runId) => runId !== envelope.runId));
          setConnectionState("closed");
          source.close();
          void refreshRuns();
        }
      } catch (error) {
        setUiError(error instanceof Error ? error.message : String(error));
      }
    };

    source.addEventListener("run-event", onRunEvent as EventListener);
    source.onopen = () => {
      setConnectionState("live");
    };
    source.onerror = () => {
      if (terminalSeen) {
        return;
      }
      setConnectionState((current) => (current === "closed" ? "closed" : "reconnecting"));
    };

    return () => {
      terminalSeen = true;
      source.removeEventListener("run-event", onRunEvent as EventListener);
      source.close();
    };
  }, [selectedRunId]);

  const selectedRunListItem = runs.find((run) => run.runId === selectedRunId);
  const reportPayload = getReportPayload(liveRunState?.sections.report);
  const reportMarkdown = typeof reportPayload?.markdown === "string" ? reportPayload.markdown : undefined;
  const activeBlockingRunId = activeRunIds[0];
  const hasRunningRun = activeRunIds.length > 0 || liveRunState?.status === "running";
  const launchDisabled = Boolean(hasRunningRun);
  const launchDisabledReason = launchDisabled
    ? `A run is already in progress${activeBlockingRunId ? ` (${activeBlockingRunId})` : ""}. Concurrent launches are blocked to avoid data / UI conflicts.`
    : undefined;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid-fine opacity-[0.06]" />
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <header className="panel px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="font-display text-xs uppercase tracking-[0.28em] text-cyan-200/80">Market Monitor</div>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Live Review Control Surface
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
                Real-time view of pipeline stages, report sections, and non-fatal errors, with automatic JSONL replay to support refresh.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="data-pill">frontend: Vite + React + Tailwind</div>
              <div className="data-pill">transport: SSE</div>
              <div className="data-pill">replay: JSONL</div>
            </div>
          </div>
        </header>

        {uiError ? (
          <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {uiError}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
            <ControlsPanel
              onStartRun={startRun}
              starting={startingRun}
              connectionState={connectionState}
              launchDisabled={launchDisabled}
              launchDisabledReason={launchDisabledReason}
            />
            <RunListPanel
              runs={runs}
              selectedRunId={selectedRunId}
              onSelect={setSelectedRunId}
              onRefresh={() => {
                void refreshRuns();
              }}
              loading={runsLoading}
            />
          </aside>

          <main className="min-w-0 space-y-4">
            <section className="panel">
              <div className="panel-body">
                <div className="min-w-0">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <StatusBadge status={liveRunState?.status ?? selectedRunListItem?.status ?? "idle"} />
                      {liveRunState?.triggerType ? <span className="data-pill">{liveRunState.triggerType}</span> : null}
                      {liveRunState?.generatedAt ? <span className="data-pill">{formatDateTime(liveRunState.generatedAt)}</span> : null}
                      {liveRunState?.completion?.elapsedMs ? (
                        <span className="data-pill">elapsed {formatDurationMs(liveRunState.completion.elapsedMs)}</span>
                      ) : null}
                    </div>
                    <div className="font-mono text-xs text-zinc-400">
                      {selectedRunId ? `runId: ${selectedRunId}` : "No run selected"}
                    </div>
                    {liveRunState?.completion?.reportFilePath ? (
                      <div className="mt-2 text-xs text-zinc-400">report: {liveRunState.completion.reportFilePath}</div>
                    ) : selectedRunListItem?.reportFilePath ? (
                      <div className="mt-2 text-xs text-zinc-400">report (run-log): {selectedRunListItem.reportFilePath}</div>
                    ) : null}
                    {liveRunState?.completion?.message ? (
                      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300">
                        {liveRunState.completion.message}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Section Readiness</div>
                  <div className="flex flex-wrap gap-2">
                    {SECTION_READINESS_ITEMS.map(({ key, label }) => {
                      const readiness = getSectionReadinessState(liveRunState, key);
                      return (
                        <div
                          key={key}
                          className={cx(
                            "inline-flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                            readiness === "ready"
                              ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
                              : readiness === "running"
                                ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
                                : "border-white/10 bg-white/[0.02] text-zinc-500",
                          )}
                          title={`${label} · ${readiness}`}
                        >
                          <span
                            className={cx(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              readiness === "ready"
                                ? "bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.6)]"
                                : readiness === "running"
                                  ? "bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.55)]"
                                  : "bg-zinc-600",
                            )}
                          />
                          <span className="max-w-[12rem] truncate">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            <ViewTabs value={activeView} onChange={setActiveView} />

            {activeView === "overview" ? (
              <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.28fr)_minmax(0,0.72fr)]">
                <div className="min-w-0 space-y-4">
                  <div className="grid items-start gap-4 xl:grid-cols-2">
                    <RegimeSummaryCard state={liveRunState} />
                    <SentimentSummaryCard state={liveRunState} />
                  </div>
                  <OutlookSummaryCard state={liveRunState} />
                  <PositioningSummaryCard state={liveRunState} />
                </div>
                <div className="min-w-0 space-y-4">
                  <ActivityOverviewCard state={liveRunState} connectionState={connectionState} />
                  <RiskInvalidationSummaryCard state={liveRunState} />
                  <JsonSectionCard
                    title="Diagnostics"
                    subtitle="Technical metadata (summary)"
                    payload={liveRunState?.sections.diagnostics}
                    maxHeight="max-h-64"
                  />
                </div>
              </div>
            ) : null}

            {activeView === "news" ? (
              <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
                <div className="min-w-0">
                  <TopArticlesCard state={liveRunState} />
                </div>
                <div className="min-w-0 space-y-4">
                  <JsonSectionCard title="News Intake" subtitle="RSS ingestion summary" payload={liveRunState?.sections.news} />
                </div>
              </div>
            ) : null}

            {activeView === "data" ? (
              <>
                <div className="grid items-start gap-4 xl:grid-cols-2">
                  <MarketSnapshotCard state={liveRunState} />
                  <MacroContextCard state={liveRunState} />
                </div>
                <EtfFlowsCard state={liveRunState} />
              </>
            ) : null}

            {activeView === "ops" ? (
              <div className="grid items-start gap-4 xl:grid-cols-2">
                <TimelineCard state={liveRunState} />
                <LogsCard state={liveRunState} />
              </div>
            ) : null}

            {activeView === "report" ? (
              <>
                <Panel title="Report Markdown" subtitle="Final markdown (replayed from JSONL stream when available)">
                  {reportMarkdown ? (
                    <pre className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-zinc-200">
                      {reportMarkdown}
                    </pre>
                  ) : (
                    <div className="text-sm text-zinc-400">
                      Final markdown is not available in the stream yet (or this run was started outside the web/SSE server).
                    </div>
                  )}
                </Panel>
                <div className="grid items-start gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                  <JsonSectionCard title="Report Payload" subtitle="Metadata + file path (if available)" payload={liveRunState?.sections.report} />
                  <JsonSectionCard title="Config Snapshot" subtitle="Feeds, watchlist, skills, LLM" payload={liveRunState?.sections.config} />
                  <JsonSectionCard title="Diagnostics" subtitle="Rendering technical context" payload={liveRunState?.sections.diagnostics} />
                </div>
              </>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
