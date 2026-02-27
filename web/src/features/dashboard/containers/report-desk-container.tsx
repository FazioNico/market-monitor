import { useState } from "react";
import webPackage from "../../../../package.json";

import {
  API_BASE,
  GITHUB_OWNER,
  GITHUB_REPO,
  IS_PUBLIC_READONLY,
  SECTION_READINESS_ITEMS,
  SOFTWARE_COMMIT_SHA_FALLBACK,
} from "../constants";
import { useDashboardController } from "../hooks/use-dashboard-controller";
import { getSectionReadinessState } from "../state/live-run";
import type { DashboardViewKey } from "../types";
import { downloadTextFile } from "../utils/files";
import {
  formatDateTime,
  formatDurationMs,
  formatUtcDateTimeMinute,
} from "../utils/formatters";
import { cx } from "../utils/guards";
import {
  CommoditiesSnapshotCard,
  CryptoSnapshotCard,
  EtfFlowsCard,
  IndexesSnapshotCard,
  MacroContextCard,
  NewsSourcesCard,
  OtherMarketSnapshotCard,
  TopArticlesCard,
} from "../components/data-cards";
import { JsonSectionCard, LogsCard, TimelineCard } from "../components/ops-cards";
import { ConnectionBadge, Panel, RevealIn, StatusBadge, ViewTabs } from "../components/primitives";
import {
  ActivityOverviewCard,
  OutlookSummaryCard,
  PositioningSummaryCard,
  RegimeSummaryCard,
  RiskInvalidationSummaryCard,
  SentimentSummaryCard,
} from "../components/summary-cards";
import { ControlsPanel, RunListPanel } from "../components/sidebar";
import { SoftwareVersionPill } from "../components/software-version-pill";

export function ReportDeskContainer() {
  const {
    runs,
    activeRunIds,
    runsLoading,
    selectedRunId,
    setSelectedRunId,
    liveRunState,
    connectionState,
    startingRun,
    uiError,
    reportMarkdown,
    selectedRunListItem,
    selectedReportPath,
    refreshRuns,
    startRun,
  } = useDashboardController();

  const [activeView, setActiveView] = useState<DashboardViewKey>("overview");
  const [activityCompact, setActivityCompact] = useState(true);

  const activeBlockingRunId = activeRunIds[0];
  const hasRunningRun = activeRunIds.length > 0 || liveRunState?.status === "running";
  const launchDisabled = Boolean(hasRunningRun);
  const launchDisabledReason = launchDisabled
    ? `A run is already in progress${activeBlockingRunId ? ` (${activeBlockingRunId})` : ""}. Concurrent launches are blocked to avoid data / UI conflicts.`
    : undefined;

  const latestReportRun = runs.reduce<typeof runs[number] | undefined>((latest, run) => {
    if (!run.reportFilePath) return latest;
    if (!latest) return run;
    const currentTs = Date.parse(run.endedAt ?? run.startedAt);
    const latestTs = Date.parse(latest.endedAt ?? latest.startedAt);
    if (Number.isNaN(currentTs)) return latest;
    if (Number.isNaN(latestTs)) return run;
    return currentTs > latestTs ? run : latest;
  }, undefined);

  const latestReportAt =
    latestReportRun?.endedAt ?? latestReportRun?.startedAt ?? liveRunState?.completion?.at;

  const softwareVersion = String(webPackage.version ?? "0.0.0");

  const readinessCounts = SECTION_READINESS_ITEMS.reduce(
    (acc, { key }) => {
      const state = getSectionReadinessState(liveRunState, key);
      acc[state] += 1;
      return acc;
    },
    { ready: 0, running: 0, standby: 0 } as Record<
      "ready" | "running" | "standby",
      number
    >,
  );

  const readinessSequence = SECTION_READINESS_ITEMS.map(
    ({ key, label, shortLabel }) => ({
      key,
      label,
      shortLabel,
      readiness: getSectionReadinessState(liveRunState, key),
    }),
  );

  const runningReadinessLabel = readinessSequence.find(
    (item) => item.readiness === "running",
  )?.label;

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 bg-grid-fine opacity-[0.06]" />
      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <header className="panel px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="font-display text-xs uppercase tracking-[0.28em] text-cyan-200/80">
                Market Monitor
              </div>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Report Desk
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
                Consolidated macro, news, and price-action signals with a clear
                directional view and risk guidance.
              </p>
            </div>
            <div className="flex w-full flex-col items-start gap-1.5 lg:max-w-[860px] lg:items-end">
              <div className="flex w-full flex-col items-start gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
                <div className="data-pill">Schedule: Daily at 08:00 UTC</div>
                <div className="data-pill">
                  Latest Report: {formatUtcDateTimeMinute(latestReportAt)}
                </div>
              </div>
              <div className="flex w-full flex-col items-start gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
                <SoftwareVersionPill
                  version={softwareVersion}
                  fallbackSha={SOFTWARE_COMMIT_SHA_FALLBACK}
                />
                <div className="data-pill flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-zinc-300/80">Links:</span>
                  <a
                    className="transition hover:text-cyan-100"
                    href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}#readme`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Sources &amp; Methodology
                  </a>
                  <span className="text-zinc-500">•</span>
                  <a
                    className="transition hover:text-cyan-100"
                    href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub
                  </a>
                </div>
              </div>
            </div>
          </div>
        </header>

        {uiError ? (
          <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {uiError}
          </div>
        ) : null}

        {IS_PUBLIC_READONLY ? (
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
            Public mode: history and reports are read-only from static artifacts.
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4">
            {!IS_PUBLIC_READONLY ? (
              <ControlsPanel
                onStartRun={startRun}
                starting={startingRun}
                connectionState={connectionState}
                launchDisabled={launchDisabled}
                launchDisabledReason={launchDisabledReason}
                apiBase={API_BASE}
              />
            ) : (
              <Panel
                title="Control Surface"
                subtitle="Disabled in public mode"
                actions={<ConnectionBadge status={connectionState} />}
              >
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-400">
                  Run triggering is disabled on the public deployment.
                </div>
              </Panel>
            )}
            {!IS_PUBLIC_READONLY ? (
              <ActivityOverviewCard
                state={liveRunState}
                connectionState={connectionState}
                compact={activityCompact}
                onToggleCompact={() => setActivityCompact((current) => !current)}
              />
            ) : (
              <Panel
                title="Live Activity"
                subtitle="Disabled in public mode"
                actions={<ConnectionBadge status={connectionState} />}
              >
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-400">
                  Live stream monitoring is disabled on the public deployment.
                </div>
              </Panel>
            )}
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
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={
                        liveRunState?.status ?? selectedRunListItem?.status ?? "idle"
                      }
                    />
                    {liveRunState?.triggerType ? (
                      <span className="data-pill">{liveRunState.triggerType}</span>
                    ) : null}
                    {liveRunState?.generatedAt ? (
                      <span className="data-pill">{formatDateTime(liveRunState.generatedAt)}</span>
                    ) : null}
                    {liveRunState?.completion?.elapsedMs ? (
                      <span className="data-pill">
                        elapsed {formatDurationMs(liveRunState.completion.elapsedMs)}
                      </span>
                    ) : null}
                    {selectedRunId ? (
                      <span
                        className="data-pill min-w-0 max-w-full font-mono text-[11px]"
                        title={selectedRunId}
                      >
                        <span className="mr-1 text-zinc-500">run</span>
                        <span className="truncate">{selectedRunId}</span>
                      </span>
                    ) : (
                      <span className="data-pill text-zinc-500">
                        No run selected
                      </span>
                    )}
                    {selectedReportPath ? (
                      <span
                        className="data-pill min-w-0 max-w-full"
                        title={selectedReportPath}
                      >
                        <span className="mr-1 text-zinc-500">report</span>
                        <span className="truncate">
                          {selectedReportPath.split("/").pop() ?? selectedReportPath}
                        </span>
                      </span>
                    ) : null}
                  </div>

                  {liveRunState?.completion?.message ? (
                    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-300">
                      {liveRunState.completion.message}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">
                      Section Readiness
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="data-pill border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                        ready {readinessCounts.ready}
                      </span>
                      <span className="data-pill border border-amber-300/20 bg-amber-400/10 text-amber-100">
                        running {readinessCounts.running}
                      </span>
                      <span className="data-pill text-zinc-400">
                        standby {readinessCounts.standby}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2">
                    <div className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-zinc-400">
                      Workflow
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      {readinessSequence.map(
                        ({ key, label, shortLabel, readiness }, index) => (
                          <div
                            key={key}
                            className="flex min-w-0 flex-1 items-center gap-1"
                          >
                            <div
                              className="group relative min-w-0 flex-1"
                              title={`${index + 1}. ${label} · ${readiness}`}
                            >
                              <div className="mb-1 truncate text-center text-[9px] font-medium uppercase tracking-[0.1em] text-zinc-500">
                                {shortLabel}
                              </div>
                              <div
                                className={cx(
                                  "h-2 rounded-full transition-colors",
                                  readiness === "ready"
                                    ? "bg-cyan-300/90 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
                                    : readiness === "running"
                                      ? "animate-pulse bg-amber-300/90 shadow-[0_0_10px_rgba(251,191,36,0.35)]"
                                      : "bg-white/10",
                                )}
                              />
                              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-ink-950/95 px-2 py-1 text-[10px] text-zinc-200 shadow-lg group-hover:block">
                                {label}
                              </div>
                            </div>
                            {index < readinessSequence.length - 1 ? (
                              <div className="h-px w-1 shrink-0 bg-white/10" />
                            ) : null}
                          </div>
                        ),
                      )}
                    </div>
                    <div className="min-w-0 shrink text-right text-[11px] text-zinc-300">
                      <span className="font-mono text-zinc-200">
                        {readinessCounts.ready + readinessCounts.running}
                      </span>
                      <span className="text-zinc-500">
                        /{SECTION_READINESS_ITEMS.length}
                      </span>
                      {runningReadinessLabel ? (
                        <span
                          className="ml-2 inline-block max-w-[11rem] truncate text-amber-200"
                          title={runningReadinessLabel}
                        >
                          {runningReadinessLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="sticky top-3 z-20">
              <ViewTabs value={activeView} onChange={setActiveView} />
            </div>

            {activeView === "overview" ? (
              <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.28fr)_minmax(0,0.72fr)]">
                <div className="min-w-0 space-y-4">
                  <div className="grid items-start gap-4 xl:grid-cols-2">
                    <RevealIn delayMs={0}>
                      <RegimeSummaryCard state={liveRunState} />
                    </RevealIn>
                    <RevealIn delayMs={50}>
                      <SentimentSummaryCard state={liveRunState} />
                    </RevealIn>
                  </div>
                  <RevealIn delayMs={90}>
                    <PositioningSummaryCard state={liveRunState} />
                  </RevealIn>
                  <RevealIn delayMs={130}>
                    <RiskInvalidationSummaryCard state={liveRunState} />
                  </RevealIn>
                </div>
                <div className="min-w-0 space-y-4">
                  <RevealIn delayMs={40}>
                    <OutlookSummaryCard state={liveRunState} />
                  </RevealIn>
                  <RevealIn delayMs={80}>
                    <JsonSectionCard
                      title="Diagnostics"
                      subtitle="Technical metadata (summary)"
                      payload={liveRunState?.sections.diagnostics}
                      maxHeight="max-h-64"
                    />
                  </RevealIn>
                </div>
              </div>
            ) : null}

            {activeView === "news" ? (
              <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
                <RevealIn delayMs={0} className="min-w-0">
                  <TopArticlesCard state={liveRunState} />
                </RevealIn>
                <RevealIn delayMs={60} className="min-w-0 space-y-4">
                  <NewsSourcesCard state={liveRunState} />
                  <JsonSectionCard
                    title="News Intake"
                    subtitle="RSS ingestion summary"
                    payload={liveRunState?.sections.news}
                  />
                </RevealIn>
              </div>
            ) : null}

            {activeView === "data" ? (
              <>
                <div className="grid items-start gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                  <RevealIn delayMs={0}>
                    <CryptoSnapshotCard state={liveRunState} />
                  </RevealIn>
                  <RevealIn delayMs={50}>
                    <IndexesSnapshotCard state={liveRunState} />
                  </RevealIn>
                  <RevealIn delayMs={100}>
                    <CommoditiesSnapshotCard state={liveRunState} />
                  </RevealIn>
                </div>
                <RevealIn delayMs={140}>
                  <OtherMarketSnapshotCard state={liveRunState} />
                </RevealIn>
                <RevealIn delayMs={180}>
                  <MacroContextCard state={liveRunState} />
                </RevealIn>
                <RevealIn delayMs={220}>
                  <EtfFlowsCard state={liveRunState} />
                </RevealIn>
              </>
            ) : null}

            {activeView === "ops" ? (
              <div className="grid items-start gap-4 xl:grid-cols-2">
                <RevealIn delayMs={0}>
                  <TimelineCard state={liveRunState} />
                </RevealIn>
                <RevealIn delayMs={60}>
                  <LogsCard state={liveRunState} />
                </RevealIn>
              </div>
            ) : null}

            {activeView === "report" ? (
              <>
                <RevealIn delayMs={0}>
                  <Panel
                    title="Report Markdown"
                    subtitle="Final markdown (replayed from JSONL stream when available)"
                    actions={
                      <button
                        type="button"
                        disabled={!reportMarkdown}
                        onClick={() => {
                          if (!reportMarkdown) return;
                          const filename =
                            liveRunState?.completion?.reportFileName ??
                            selectedRunListItem?.reportFilePath?.split("/").pop() ??
                            `${selectedRunId ?? "market-monitor-report"}.md`;
                          downloadTextFile(
                            filename,
                            reportMarkdown,
                            "text/markdown;charset=utf-8",
                          );
                        }}
                        className={cx(
                          "rounded-lg border px-3 py-1.5 text-xs transition",
                          reportMarkdown
                            ? "border-white/15 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
                            : "cursor-not-allowed border-white/10 bg-white/[0.02] text-zinc-500",
                        )}
                        title={
                          reportMarkdown
                            ? "Download markdown file"
                            : "Markdown not available yet"
                        }
                      >
                        Download .md
                      </button>
                    }
                  >
                    {reportMarkdown ? (
                      <pre className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 text-xs leading-relaxed text-zinc-200">
                        {reportMarkdown}
                      </pre>
                    ) : (
                      <div className="text-sm text-zinc-400">
                        Final markdown is not available in the stream yet (or
                        this run was started outside the web/SSE server).
                      </div>
                    )}
                  </Panel>
                </RevealIn>
                <div className="grid items-start gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                  <RevealIn delayMs={50}>
                    <JsonSectionCard
                      title="Report Payload"
                      subtitle="Metadata + file path (if available)"
                      payload={liveRunState?.sections.report}
                    />
                  </RevealIn>
                  <RevealIn delayMs={90}>
                    <JsonSectionCard
                      title="Config Snapshot"
                      subtitle="Feeds, watchlist, skills, LLM"
                      payload={liveRunState?.sections.config}
                    />
                  </RevealIn>
                  <RevealIn delayMs={130}>
                    <JsonSectionCard
                      title="Diagnostics"
                      subtitle="Rendering technical context"
                      payload={liveRunState?.sections.diagnostics}
                    />
                  </RevealIn>
                </div>
              </>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
