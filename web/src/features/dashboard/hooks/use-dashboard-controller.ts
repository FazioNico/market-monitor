import { useCallback, useEffect, useState } from "react";

import { API_BASE, IS_PUBLIC_READONLY } from "../constants";
import {
  fetchReportMarkdownFromPublicArtifacts,
  fetchRunEventsFromPublicArtifacts,
  fetchRunsFromApi,
  fetchRunsFromPublicArtifacts,
  RunAlreadyInProgressError,
  startRunRequest,
} from "../services/run-service";
import {
  createInitialLiveRunState,
  isTerminalEvent,
  reduceEnvelope,
} from "../state/live-run";
import type {
  ConnectionState,
  LiveRunState,
  TriggerType,
} from "../types";
import { getReportPayload } from "../utils/parsers";

import type { RunListItem, RunReviewEventEnvelope } from "../../../types";

export function useDashboardController() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [activeRunIds, setActiveRunIds] = useState<string[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [liveRunState, setLiveRunState] = useState<LiveRunState>();
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [startingRun, setStartingRun] = useState(false);
  const [uiError, setUiError] = useState<string>();
  const [reportMarkdownFromFile, setReportMarkdownFromFile] = useState<string>();

  const refreshRuns = useCallback(async (): Promise<void> => {
    setRunsLoading(true);
    try {
      const response = IS_PUBLIC_READONLY
        ? await fetchRunsFromPublicArtifacts()
        : await fetchRunsFromApi();

      setRuns(response.items);
      setActiveRunIds(response.activeRunIds);
      setSelectedRunId((current) => current ?? response.items[0]?.runId);

      if (IS_PUBLIC_READONLY) {
        setConnectionState("closed");
      }

      setUiError(undefined);
    } catch (error) {
      setUiError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunsLoading(false);
    }
  }, []);

  const startRun = useCallback(
    async (input: {
      triggerType: TriggerType;
      dateOverride?: string;
      scheduleSlotKey?: string;
    }): Promise<void> => {
      if (IS_PUBLIC_READONLY) {
        return;
      }

      setStartingRun(true);
      try {
        const { runId } = await startRunRequest(input);
        setActiveRunIds([runId]);
        setSelectedRunId(runId);
        setLiveRunState(createInitialLiveRunState(runId));
        setConnectionState("connecting");
        await refreshRuns();
      } catch (error) {
        if (error instanceof RunAlreadyInProgressError) {
          if (error.activeRunIds.length > 0) {
            setActiveRunIds(error.activeRunIds);
          }
          if (error.activeRunId) {
            setSelectedRunId(error.activeRunId);
          }
        }
        setUiError(error instanceof Error ? error.message : String(error));
      } finally {
        setStartingRun(false);
      }
    },
    [refreshRuns],
  );

  useEffect(() => {
    void refreshRuns();
    const handle = setInterval(() => {
      void refreshRuns();
    }, 15_000);

    return () => clearInterval(handle);
  }, [refreshRuns]);

  useEffect(() => {
    if (!selectedRunId) {
      setLiveRunState(undefined);
      setConnectionState("idle");
      return;
    }

    if (IS_PUBLIC_READONLY) {
      setConnectionState("closed");
      const runId = selectedRunId;
      const controller = new AbortController();
      let cancelled = false;
      setLiveRunState(createInitialLiveRunState(runId));

      async function loadStaticRunEvents(): Promise<void> {
        try {
          const envelopes = await fetchRunEventsFromPublicArtifacts(
            runId,
            controller.signal,
          );

          const reduced = envelopes.reduce(
            (state, envelope) => reduceEnvelope(state, envelope),
            createInitialLiveRunState(runId),
          );

          if (!cancelled) {
            setLiveRunState(reduced);
            setUiError(undefined);
          }
        } catch (error) {
          if (cancelled) {
            return;
          }
          setUiError(error instanceof Error ? error.message : String(error));
        }
      }

      void loadStaticRunEvents();
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    setLiveRunState(createInitialLiveRunState(selectedRunId));
    setConnectionState("connecting");

    const source = new EventSource(
      `${API_BASE}/api/runs/${encodeURIComponent(selectedRunId)}/events`,
    );
    let terminalSeen = false;

    const onRunEvent = (message: MessageEvent<string>) => {
      try {
        const envelope = JSON.parse(message.data) as RunReviewEventEnvelope;
        setLiveRunState((current) =>
          reduceEnvelope(
            current ?? createInitialLiveRunState(selectedRunId),
            envelope,
          ),
        );
        if (isTerminalEvent(envelope.event)) {
          terminalSeen = true;
          setActiveRunIds((current) =>
            current.filter((runId) => runId !== envelope.runId),
          );
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
      setConnectionState((current) =>
        current === "closed" ? "closed" : "reconnecting",
      );
    };

    return () => {
      terminalSeen = true;
      source.removeEventListener("run-event", onRunEvent as EventListener);
      source.close();
    };
  }, [refreshRuns, selectedRunId]);

  const selectedRunListItem = runs.find((run) => run.runId === selectedRunId);
  const selectedReportPath =
    liveRunState?.completion?.reportFilePath ?? selectedRunListItem?.reportFilePath;

  useEffect(() => {
    if (!IS_PUBLIC_READONLY) {
      setReportMarkdownFromFile(undefined);
      return;
    }

    if (!selectedReportPath) {
      setReportMarkdownFromFile(undefined);
      return;
    }
    const reportPath = selectedReportPath;

    const controller = new AbortController();
    let cancelled = false;

    async function loadReportMarkdown(): Promise<void> {
      try {
        const markdown = await fetchReportMarkdownFromPublicArtifacts(
          reportPath,
          controller.signal,
        );
        if (!cancelled) {
          setReportMarkdownFromFile(markdown);
          setUiError(undefined);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setReportMarkdownFromFile(undefined);
        setUiError(error instanceof Error ? error.message : String(error));
      }
    }

    void loadReportMarkdown();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedReportPath]);

  const reportPayload = getReportPayload(liveRunState?.sections.report);
  const reportMarkdownLive =
    typeof reportPayload?.markdown === "string" ? reportPayload.markdown : undefined;
  const reportMarkdown = reportMarkdownFromFile ?? reportMarkdownLive;

  return {
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
  };
}
