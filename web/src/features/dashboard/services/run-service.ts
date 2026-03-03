import type {
  RunListItem,
  RunReviewEventEnvelope,
} from "../../../types";

import { API_BASE } from "../constants";
import type { TriggerType } from "../types";
import { parseRunEventEnvelopesFromJsonl, parseRunListItemsFromJsonl } from "../utils/parsers";
import { buildPublicAssetUrl, normalizeReportPath } from "../utils/public-assets";
import { isRecord } from "../utils/guards";

export interface RunsResponse {
  items: RunListItem[];
  activeRunIds: string[];
}

export interface StartRunInput {
  triggerType: TriggerType;
  dateOverride?: string;
  scheduleSlotKey?: string;
}

export class RunAlreadyInProgressError extends Error {
  activeRunId?: string;
  activeRunIds: string[];

  constructor(params: { message: string; activeRunId?: string; activeRunIds: string[] }) {
    super(params.message);
    this.name = "RunAlreadyInProgressError";
    this.activeRunId = params.activeRunId;
    this.activeRunIds = params.activeRunIds;
  }
}

export async function fetchRunsFromApi(): Promise<RunsResponse> {
  const response = await fetch(`${API_BASE}/api/runs`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    items?: RunListItem[];
    activeRunIds?: string[];
  };

  const items = Array.isArray(data.items) ? data.items : [];
  const activeRunIds = Array.isArray(data.activeRunIds)
    ? data.activeRunIds.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      )
    : [];

  return { items, activeRunIds };
}

export async function fetchRunsFromPublicArtifacts(): Promise<RunsResponse> {
  const response = await fetch(buildPublicAssetUrl("logs/runs.jsonl"), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to load public run history (HTTP ${response.status})`);
  }

  const content = await response.text();
  return {
    items: parseRunListItemsFromJsonl(content),
    activeRunIds: [],
  };
}

export async function startRunRequest(input: StartRunInput): Promise<{ runId: string }> {
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
      const activeRunId =
        typeof payload.activeRunId === "string" ? payload.activeRunId : undefined;
      const activeRunIds = Array.isArray(payload.activeRunIds)
        ? payload.activeRunIds.filter(
            (value): value is string => typeof value === "string",
          )
        : activeRunId
          ? [activeRunId]
          : [];

      throw new RunAlreadyInProgressError({
        message:
          "A run is already in progress. Wait for it to finish before starting another one.",
        activeRunId,
        activeRunIds,
      });
    }

    const fallback =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : undefined;
    throw new Error(fallback ?? `HTTP ${response.status}`);
  }

  const data = (await response.json()) as { runId?: string };
  if (!data.runId) {
    throw new Error("runId missing in response");
  }

  return { runId: data.runId };
}

export async function fetchRunEventsFromPublicArtifacts(
  runId: string,
  signal?: AbortSignal,
): Promise<RunReviewEventEnvelope[]> {
  const response = await fetch(
    buildPublicAssetUrl(`logs/run-events/${runId}.jsonl`),
    {
      signal,
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Unable to load run events (HTTP ${response.status})`);
  }

  const content = await response.text();
  return parseRunEventEnvelopesFromJsonl(content);
}

export async function fetchReportMarkdownFromPublicArtifacts(
  reportPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const normalizedReportPath = normalizeReportPath(reportPath);
  const response = await fetch(buildPublicAssetUrl(normalizedReportPath), {
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to load report markdown (HTTP ${response.status})`);
  }

  return response.text();
}
