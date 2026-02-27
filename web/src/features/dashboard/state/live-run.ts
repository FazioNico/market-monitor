import type {
  RunReviewEventEnvelope,
  RunReviewServiceEvent,
} from "../../../types";

import { SECTION_STAGE_MAP } from "../constants";
import type {
  LiveRunState,
  RunReviewSectionKey,
  SectionReadinessState,
  StageState,
} from "../types";

export function createInitialLiveRunState(runId: string): LiveRunState {
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

export function isTerminalEvent(event: RunReviewServiceEvent): boolean {
  return (
    event.type === "run.completed" ||
    event.type === "run.failed" ||
    event.type === "run.skipped_duplicate"
  );
}

export function reduceEnvelope(
  state: LiveRunState,
  envelope: RunReviewEventEnvelope,
): LiveRunState {
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
    next.logs = [
      ...next.logs,
      { at: event.at, level: event.level, message: event.message },
    ].slice(-300);
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

export function getOrderedStages(state?: LiveRunState): StageState[] {
  if (!state) {
    return [];
  }
  return state.stagesOrder
    .map((stageKey) => state.stages[stageKey])
    .filter(Boolean) as StageState[];
}

export function getSectionReadinessState(
  state: LiveRunState | undefined,
  sectionKey: RunReviewSectionKey,
): SectionReadinessState {
  if (!state) {
    return "standby";
  }

  const linkedStages = SECTION_STAGE_MAP[sectionKey] ?? [];
  const hasRunningStage = linkedStages.some(
    (stageKey) => state.stages[stageKey]?.status === "running",
  );
  if (hasRunningStage) {
    return "running";
  }

  return state.sections[sectionKey] !== undefined ? "ready" : "standby";
}
