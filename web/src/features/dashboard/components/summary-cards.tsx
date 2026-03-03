import type { ConnectionState, LiveRunState } from "../types";

import { getOrderedStages } from "../state/live-run";
import {
  formatDurationMs,
  levelTone,
} from "../utils/formatters";
import { cx } from "../utils/guards";
import {
  getOutlookPayload,
  getPositioningPayload,
  getRegimePayload,
  getRiskInvalidationPayload,
  getSentimentPayload,
} from "../utils/parsers";
import { ConnectionBadge, Panel } from "./primitives";

export function ActivityOverviewCard({
  state,
  connectionState,
  compact,
  onToggleCompact,
}: {
  state?: LiveRunState;
  connectionState: ConnectionState;
  compact: boolean;
  onToggleCompact: () => void;
}) {
  if (!state) {
    return (
      <Panel
        title="Live Activity"
        subtitle="Current run monitoring"
        actions={
          <button
            type="button"
            onClick={onToggleCompact}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
          >
            {compact ? "Extended" : "Compact"}
          </button>
        }
      >
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-400">
          Select a run to view activity.
        </div>
      </Panel>
    );
  }

  const orderedStages = getOrderedStages(state);
  const runningStage = [...orderedStages]
    .reverse()
    .find((stage) => stage.status === "running");
  const latestStage =
    orderedStages.length > 0
      ? orderedStages[orderedStages.length - 1]
      : undefined;
  const lastIssue = [...state.logs]
    .reverse()
    .find((line) => line.level === "error" || line.level === "warn");
  const recentLogs = state.logs.slice(-(compact ? 2 : 4)).reverse();
  const completedStages = orderedStages.filter(
    (stage) => stage.status === "completed",
  ).length;
  const totalStages = orderedStages.length;
  const pipelinePct =
    totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  const metricCards = [
    {
      label: "Connection",
      value: connectionState,
      tone:
        connectionState === "live"
          ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
          : connectionState === "reconnecting" ||
              connectionState === "connecting"
            ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
            : "border-white/10 bg-white/[0.02] text-zinc-300",
    },
    {
      label: "Top Articles",
      value:
        state.topArticleProgress && state.topArticleProgress.total > 0
          ? `${state.topArticleProgress.completed}/${state.topArticleProgress.total}`
          : "Pending",
      tone:
        state.topArticleProgress && state.topArticleProgress.total > 0
          ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
          : "border-white/10 bg-white/[0.02] text-zinc-400",
    },
    {
      label: "Pipeline",
      value:
        totalStages > 0
          ? `${completedStages}/${totalStages} completed`
          : "No stage yet",
      tone: "border-white/10 bg-white/[0.02] text-zinc-100",
    },
  ] as const;

  return (
    <Panel
      title="Live Activity"
      subtitle={compact ? "Sidebar monitor (compact)" : "Current run monitoring"}
      className="overflow-visible"
      actions={
        <button
          type="button"
          onClick={onToggleCompact}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
        >
          {compact ? "Extended" : "Compact"}
        </button>
      }
    >
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-cyan-400/5 via-white/[0.02] to-emerald-400/5 p-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
              <span>Current Stage</span>
              {state.status === "running" ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />
              ) : null}
            </div>
            <div className="mt-1 truncate text-sm font-medium text-zinc-100">
              {runningStage?.label ?? latestStage?.label ?? "Waiting"}
            </div>
          </div>
          <ConnectionBadge status={connectionState} />
        </div>
        <div className="mt-3 overflow-hidden rounded-full border border-white/5 bg-white/5">
          <div
            className={cx(
              "h-1.5 rounded-full bg-gradient-to-r from-cyan-300/80 to-emerald-300/80 transition-[width] duration-300",
              state.status === "running" ? "animate-pulse" : "",
            )}
            style={{ width: `${Math.max(4, pipelinePct)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
          <span>
            {totalStages > 0
              ? `${completedStages}/${totalStages} stages`
              : "No stage yet"}
          </span>
          {state.completion?.elapsedMs ? (
            <span>{formatDurationMs(state.completion.elapsedMs)}</span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(compact ? metricCards.slice(0, 2) : metricCards).map((card) => (
          <div
            key={card.label}
            className={cx(
              "rounded-xl border px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
              card.tone,
            )}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">
              {card.label}
            </div>
            <div className="mt-1 text-sm font-medium">{card.value}</div>
          </div>
        ))}
      </div>

      {!compact && lastIssue ? (
        <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/10 px-3 py-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-amber-200">
            Latest Warning/Error
          </div>
          <div
            className={cx("mt-1 truncate text-sm", levelTone(lastIssue.level))}
            title={lastIssue.message}
          >
            {lastIssue.message}
          </div>
        </div>
      ) : null}

      {!compact ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.02] to-black/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
              Recent Events
            </div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              live
            </div>
          </div>
          {recentLogs.length === 0 ? (
            <div className="text-sm text-zinc-500">No notable logs yet.</div>
          ) : (
            <div className="space-y-1.5">
              {recentLogs.map((line, index) => (
                <div
                  key={`${line.at}-${index}`}
                  className="grid grid-cols-[52px_34px_1fr] gap-2 rounded-lg border border-white/5 bg-black/10 px-2 py-1.5 text-xs"
                >
                  <span className="text-zinc-500">
                    {new Date(line.at).toLocaleTimeString("en-US")}
                  </span>
                  <span
                    className={cx("uppercase tracking-wide", levelTone(line.level))}
                  >
                    {line.level}
                  </span>
                  <span className="truncate text-zinc-300" title={line.message}>
                    {line.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

export function RegimeSummaryCard({ state }: { state?: LiveRunState }) {
  const regime = getRegimePayload(state?.sections.regime);
  const label = regime?.label ?? "pending";
  const labelText =
    label === "risk_on"
      ? "Risk On"
      : label === "risk_off"
        ? "Risk Off"
        : label === "transition"
          ? "Transition"
          : label;
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
    <Panel
      title="Regime"
      subtitle="Executive summary of the current market regime"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("data-pill border", tone, "text-sm font-semibold")}>
          {labelText}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {signals.map((signal) => (
          <div
            key={signal.label}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5"
          >
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
              {signal.label}
            </div>
            <div className="mt-1 text-sm leading-snug text-zinc-200">
              {signal.value ?? "Pending..."}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
          Rationale
        </div>
        <p className="mt-1 text-sm leading-relaxed text-zinc-200">
          {regime?.rationale ??
            "The regime rationale will appear here as soon as the analysis is ready."}
        </p>
      </div>
    </Panel>
  );
}

export function SentimentSummaryCard({ state }: { state?: LiveRunState }) {
  const sentiment = getSentimentPayload(state?.sections.sentiment);
  const score = sentiment?.score;
  const scorePct =
    typeof score === "number"
      ? Math.max(0, Math.min(100, score * 10))
      : undefined;
  const scoreTone =
    score === undefined
      ? "border-white/10 bg-white/[0.02] text-zinc-300"
      : score >= 7
        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
        : score >= 4
          ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
          : "border-rose-300/20 bg-rose-400/10 text-rose-100";

  return (
    <Panel
      title="Sentiment"
      subtitle="Sentiment readout and price-action coherence"
    >
      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className={cx("rounded-2xl border px-4 py-3", scoreTone)}>
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            Score
          </div>
          <div className="mt-1 font-display text-2xl font-semibold">
            {typeof score === "number" ? score.toFixed(1) : "--"}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            {sentiment?.method ? (
              <span className="data-pill">method: {sentiment.method}</span>
            ) : null}
            {sentiment?.status ? (
              <span className="data-pill">status: {sentiment.status}</span>
            ) : null}
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
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            Price Action Coherence
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-200">
            {sentiment?.priceActionCoherence ??
              "Waiting for the coherence assessment."}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
            Narrative Summary
          </div>
          <p className="mt-1 text-sm leading-relaxed text-zinc-200">
            {sentiment?.narrativeSummary ??
              "The narrative summary will appear here once sentiment is computed."}
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
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
          {title}
        </div>
        <span className="text-xs text-zinc-500">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="mt-2 text-sm text-zinc-500">{emptyLabel}</div>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.slice(0, 4).map((item, index) => (
            <li
              key={`${title}-${index}`}
              className="flex gap-2 text-sm leading-relaxed text-zinc-200"
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/30" />
              <span>{item}</span>
            </li>
          ))}
          {items.length > 4 ? (
            <li className="text-xs text-zinc-500">
              + {items.length - 4} more items
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

export function OutlookSummaryCard({ state }: { state?: LiveRunState }) {
  const outlook = getOutlookPayload(state?.sections.outlook);
  const bull = Math.max(0, outlook?.bullPct ?? 0);
  const base = Math.max(0, outlook?.basePct ?? 0);
  const bear = Math.max(0, outlook?.bearPct ?? 0);
  const total = Math.max(1, bull + base + bear);
  const bullH = (bull / total) * 100;
  const baseH = (base / total) * 100;
  const bearH = (bear / total) * 100;
  const primary = outlook?.primaryScenario ?? "pending";
  const primaryText =
    primary === "bull"
      ? "Bull"
      : primary === "base"
        ? "Base"
        : primary === "bear"
          ? "Bear"
          : "Pending";
  const primaryTone =
    primary === "bull"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : primary === "bear"
        ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
        : primary === "base"
          ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
          : "border-white/10 bg-white/[0.02] text-zinc-300";
  const ranking = [
    {
      label: "Bull",
      value: bull,
      tone: "text-emerald-200",
      fill: "bg-emerald-300/75",
      bg: "bg-emerald-400/25",
    },
    {
      label: "Base",
      value: base,
      tone: "text-cyan-200",
      fill: "bg-cyan-300/75",
      bg: "bg-cyan-400/25",
    },
    {
      label: "Bear",
      value: bear,
      tone: "text-rose-200",
      fill: "bg-rose-300/75",
      bg: "bg-rose-400/25",
    },
  ].sort((a, b) => b.value - a.value);
  const topRank = ranking[0] ?? { label: "Pending", value: 0 };
  const convictionGap = Math.max(0, topRank.value - (ranking[1]?.value ?? 0));
  const convictionLabel =
    convictionGap >= 25
      ? "High conviction"
      : convictionGap >= 10
        ? "Moderate conviction"
        : "Balanced setup";

  return (
    <Panel
      title="Outlook"
      subtitle="Scenario probabilities and central rationale"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("data-pill border", primaryTone)}>
          {primaryText}
        </span>
        {typeof outlook?.constraintValidated === "boolean" ? (
          <span
            className={cx(
              "data-pill border",
              outlook.constraintValidated
                ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                : "border-amber-300/20 bg-amber-400/10 text-amber-100",
            )}
          >
            {outlook.constraintValidated
              ? "Constraint validated"
              : "Constraint pending"}
          </span>
        ) : null}
        <span className="data-pill border border-white/10 bg-white/[0.03] text-zinc-200">
          {convictionLabel}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
        <div className="mx-auto flex h-50 w-full flex-col-reverse overflow-hidden rounded-xl border border-white/10 bg-black/30">
          <div
            className="flex items-center justify-center bg-rose-400/50 text-[10px] font-semibold text-rose-100"
            style={{ height: `${bearH}%` }}
          >
            {bear > 0 ? `${Math.round(bear)}%` : ""}
          </div>
          <div
            className="flex items-center justify-center bg-cyan-400/50 text-[10px] font-semibold text-cyan-100"
            style={{ height: `${baseH}%` }}
          >
            {base > 0 ? `${Math.round(base)}%` : ""}
          </div>
          <div
            className="flex items-center justify-center bg-emerald-400/50 text-[10px] font-semibold text-emerald-100"
            style={{ height: `${bullH}%` }}
          >
            {bull > 0 ? `${Math.round(bull)}%` : ""}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Primary
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                {primaryText}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Spread
              </div>
              <div className="mt-1 text-sm font-semibold text-zinc-100">
                {convictionGap}%
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
              Distribution
            </div>
            <div className="mt-1 text-base font-semibold text-zinc-100">
              {convictionLabel}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-start gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                Bull
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/80" />
                Neutral
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400/80" />
                Bear
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
          Scenario Note
        </div>
        <p className="mt-1 text-sm leading-relaxed text-zinc-200">
          Primary scenario leads by{" "}
          <span className="font-semibold text-zinc-100">{convictionGap}%</span>{" "}
          versus the next scenario.
        </p>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
          Executive Rationale
        </div>
        <p className="mt-1 text-sm leading-relaxed text-zinc-200">
          {outlook?.justification ??
            "The outlook rationale will appear here once it is computed."}
        </p>
      </div>
    </Panel>
  );
}

export function PositioningSummaryCard({ state }: { state?: LiveRunState }) {
  const positioning = getPositioningPayload(state?.sections.positionWording);
  const status = positioning?.status ?? "pending";
  const statusTone =
    status === "complete"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : status.includes("omitted")
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : "border-white/10 bg-white/[0.02] text-zinc-300";

  return (
    <Panel
      title="Positioning"
      subtitle="Execution framework and exposure rules"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx("data-pill border", statusTone)}>
          {status.replace(/_/g, " ")}
        </span>
        {positioning?.timeHorizon ? (
          <span className="data-pill">{positioning.timeHorizon}</span>
        ) : null}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">
          Current Bias
        </div>
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

export function RiskInvalidationSummaryCard({ state }: { state?: LiveRunState }) {
  const risk = getRiskInvalidationPayload(state?.sections.riskInvalidation);
  const totalTriggers =
    (risk?.invalidationConditions.length ?? 0) +
    (risk?.keyPriceThresholds.length ?? 0) +
    (risk?.criticalMacroEvents.length ?? 0);

  return (
    <Panel
      title="Risk Invalidation"
      subtitle="Triggers to monitor that invalidate the current scenario"
    >
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
