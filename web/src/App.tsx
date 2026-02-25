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

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
  return new Intl.DateTimeFormat("fr-FR", {
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

function TimelineCard({ state }: { state?: LiveRunState }) {
  if (!state) {
    return <Panel title="Pipeline Timeline">Sélectionne un run pour ouvrir le flux.</Panel>;
  }

  const orderedStages = state.stagesOrder.map((stageKey) => state.stages[stageKey]).filter(Boolean) as StageState[];
  return (
    <Panel title="Pipeline Timeline" subtitle="Stages du pipeline, complétés au fil du streaming">
      {orderedStages.length === 0 ? (
        <div className="text-sm text-zinc-400">Aucun événement reçu pour ce run (pas encore démarré ou run historique CLI sans event log).</div>
      ) : (
        <ol className="space-y-3">
          {orderedStages.map((stage) => (
            <li key={stage.stage} className="relative rounded-xl border border-white/10 bg-white/[0.02] p-3">
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
  return (
    <Panel title="Live Logs" subtitle="Messages système et erreurs non fatales">
      {!state || state.logs.length === 0 ? (
        <div className="text-sm text-zinc-400">Pas de logs pour le moment.</div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-xs">
          {state.logs.map((line, index) => (
            <div key={`${line.at}-${index}`} className="grid grid-cols-[88px_50px_1fr] gap-2">
              <span className="text-zinc-500">{new Date(line.at).toLocaleTimeString("fr-FR")}</span>
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
      subtitle="Classement + enrichissement progressif des résumés"
      actions={
        progress ? (
          <div className="data-pill gap-2">
            <span className="font-mono text-[11px]">{progress.completed}/{progress.total}</span>
            <span className="text-zinc-400">résumés</span>
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
        <div className="text-sm text-zinc-400">Pas encore de classement d’articles.</div>
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
                        <p className="mt-2 text-sm text-zinc-500">Résumé en attente...</p>
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
    <Panel title="Market Snapshot" subtitle="Prix, variations et provider">
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-400">En attente des données marché.</div>
      ) : (
        <div className="overflow-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-zinc-400">
              <tr>
                <th className="px-3 py-2">Instrument</th>
                <th className="px-3 py-2">Prix</th>
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
    <Panel title="Macro Context" subtitle="Observations FRED / macro utilisées par le régime">
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-400">En attente du contexte macro.</div>
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
        <div className="text-sm text-zinc-400">En attente...</div>
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
      subtitle="Historique via run-log (CLI + Web)"
      actions={
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.06]"
        >
          {loading ? "Refresh..." : "Refresh"}
        </button>
      }
      className="h-full"
    >
      <div className="space-y-2">
        {runs.length === 0 ? (
          <div className="text-sm text-zinc-400">Aucun run trouvé.</div>
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
      subtitle="Lancer un run et suivre la propagation des sections en live"
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
            {starting ? "Démarrage..." : launchDisabled ? "Run en cours..." : "Lancer un run"}
          </span>
        </button>
      </form>
      {launchDisabledReason ? (
        <p className="mt-3 rounded-lg border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
          {launchDisabledReason}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-zinc-400">
        API cible: <span className="font-mono text-zinc-300">{API_BASE}</span>
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
          throw new Error("Un run est déjà en cours. Attends sa fin avant d’en lancer un autre.");
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
    ? `Un run est déjà en cours${activeBlockingRunId ? ` (${activeBlockingRunId})` : ""}. Le lancement simultané est bloqué pour éviter les conflits de données / UI.`
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
                Vue temps réel des étapes du pipeline, sections du rapport et erreurs non fatales, avec replay automatique via JSONL pour supporter le refresh.
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
          <aside className="min-w-0 space-y-4">
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
                      {selectedRunId ? `runId: ${selectedRunId}` : "Aucun run sélectionné"}
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
                      const ready = liveRunState?.sections[key] !== undefined;
                      return (
                        <div
                          key={key}
                          className={cx(
                            "inline-flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                            ready
                              ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
                              : "border-white/10 bg-white/[0.02] text-zinc-500",
                          )}
                          title={`${label} · ${ready ? "ready" : "standby"}`}
                        >
                          <span
                            className={cx(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              ready ? "bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.6)]" : "bg-zinc-600",
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

            <div className="grid gap-4 xl:grid-cols-2">
              <TimelineCard state={liveRunState} />
              <LogsCard state={liveRunState} />
            </div>

            <div className="grid items-start gap-4 2xl:grid-cols-[1.25fr_0.75fr]">
              <div className="min-w-0 self-start">
                <TopArticlesCard state={liveRunState} />
              </div>
              <div className="min-w-0 space-y-4 self-start">
                <JsonSectionCard title="Regime" subtitle="Sortie du détecteur de régime" payload={liveRunState?.sections.regime} />
                <JsonSectionCard title="Sentiment" subtitle="Évaluation sentiment / cohérence prix" payload={liveRunState?.sections.sentiment} />
                <JsonSectionCard title="Outlook" subtitle="Distribution bull/base/bear" payload={liveRunState?.sections.outlook} />
                <JsonSectionCard title="Positioning" subtitle="Guidance de positionnement" payload={liveRunState?.sections.positionWording} />
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <MarketSnapshotCard state={liveRunState} />
              <MacroContextCard state={liveRunState} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <JsonSectionCard title="Risk Invalidation" subtitle="Conditions d’invalidation et seuils" payload={liveRunState?.sections.riskInvalidation} />
              <JsonSectionCard title="Diagnostics" subtitle="Métadonnées techniques de génération" payload={liveRunState?.sections.diagnostics} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <JsonSectionCard title="Config Snapshot" subtitle="Feeds, watchlist, skills, LLM" payload={liveRunState?.sections.config} />
              <JsonSectionCard title="News Intake" subtitle="Résumé de l’ingestion RSS" payload={liveRunState?.sections.news} />
            </div>

            <Panel title="Report Markdown" subtitle="Markdown final (rejoué depuis le stream JSONL si disponible)">
              {reportMarkdown ? (
                <pre className="max-h-[480px] overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-zinc-200">
                  {reportMarkdown}
                </pre>
              ) : (
                <div className="text-sm text-zinc-400">
                  Le markdown final n’est pas encore disponible dans le flux (ou ce run a été lancé hors serveur web/SSE).
                </div>
              )}
            </Panel>
          </main>
        </div>
      </div>
    </div>
  );
}
