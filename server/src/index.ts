import { readFile } from "node:fs/promises";

import { createAppContext } from "../../src/runtime/app-context";
import {
  appendRunEventEnvelope,
  buildRunEventLogPath,
  createRunEventEnvelope,
  readRunEventEnvelopesAfterId,
} from "../../src/runtime/run-event-log";
import type { RunReviewEventEnvelope, RunReviewServiceEvent } from "../../src/runtime/run-review-events";
import { runReviewService } from "../../src/runtime/run-review-service";
import { findRunLogEntriesByRunId, readRunLogHistory } from "../../src/runtime/run-log";
import { createRunId } from "../../src/report/report-model";
import type { TriggerType } from "../../src/shared/types";

type RunTerminalStatus = "running" | "completed" | "failed" | "skipped_duplicate";
type Subscriber = (envelope: RunReviewEventEnvelope) => void;

interface ActiveRunState {
  runId: string;
  eventLogPath: string;
  nextEventId: number;
  status: RunTerminalStatus;
  subscribers: Set<Subscriber>;
  publishChain: Promise<void>;
}

const activeRuns = new Map<string, ActiveRunState>();

function getActiveRunningRunIds(): string[] {
  return [...activeRuns.values()]
    .filter((state) => state.status === "running")
    .map((state) => state.runId);
}

function getRuntimeContext() {
  return createAppContext({
    cwd: process.cwd(),
    env: process.env,
  });
}

function isTerminalEvent(event: RunReviewServiceEvent): boolean {
  return event.type === "run.completed" || event.type === "run.failed" || event.type === "run.skipped_duplicate";
}

function terminalStatusFromEvent(event: RunReviewServiceEvent): RunTerminalStatus {
  if (event.type === "run.completed") return "completed";
  if (event.type === "run.failed") return "failed";
  if (event.type === "run.skipped_duplicate") return "skipped_duplicate";
  return "running";
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Last-Event-ID",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function notFound(message = "Not found"): Response {
  return jsonResponse({ error: message }, 404);
}

function badRequest(message: string): Response {
  return jsonResponse({ error: message }, 400);
}

function serverError(message: string): Response {
  return jsonResponse({ error: message }, 500);
}

async function publishRunEvent(state: ActiveRunState, event: RunReviewServiceEvent): Promise<void> {
  state.publishChain = state.publishChain.catch(() => undefined).then(async () => {
    const envelope = createRunEventEnvelope({
      id: state.nextEventId,
      runId: state.runId,
      event,
    });
    state.nextEventId += 1;
    await appendRunEventEnvelope(state.eventLogPath, envelope);

    for (const subscriber of [...state.subscribers]) {
      try {
        subscriber(envelope);
      } catch {
        state.subscribers.delete(subscriber);
      }
    }

    if (isTerminalEvent(event)) {
      state.status = terminalStatusFromEvent(event);
    }
  });

  return state.publishChain;
}

function startRunJob(input: {
  triggerType: TriggerType;
  dateOverride?: string;
  scheduleSlotKey?: string;
}) {
  const context = getRuntimeContext();
  const runId = createRunId();
  const state: ActiveRunState = {
    runId,
    eventLogPath: buildRunEventLogPath(context.paths.logsDir, runId),
    nextEventId: 1,
    status: "running",
    subscribers: new Set(),
    publishChain: Promise.resolve(),
  };
  activeRuns.set(runId, state);

  void runReviewService({
    cwd: context.paths.cwd,
    env: process.env,
    runId,
    triggerType: input.triggerType,
    dateOverride: input.dateOverride,
    scheduleSlotKey: input.scheduleSlotKey,
    onEvent: (event) => publishRunEvent(state, event),
  })
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      // Service should already emit run.failed, but we guard against unexpected failures in the event sink path.
      if (state.status === "running") {
        await publishRunEvent(state, {
          type: "run.failed",
          runId,
          at: new Date().toISOString(),
          message,
          errorCode: 1,
        });
      }
      console.error(message);
    })
    .finally(() => {
      // Keep state for live subscribers and reconnects; JSONL is the durable source for refresh.
    });

  return {
    runId,
    eventLogPath: state.eventLogPath,
  };
}

function formatSseEvent(envelope: RunReviewEventEnvelope): string {
  return `id: ${envelope.id}\nevent: run-event\ndata: ${JSON.stringify(envelope)}\n\n`;
}

function parseLastEventId(request: Request, url: URL): number | undefined {
  const queryValue = url.searchParams.get("lastEventId") ?? url.searchParams.get("after");
  const headerValue = request.headers.get("Last-Event-ID");
  const raw = headerValue ?? queryValue;
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function buildSseResponse(request: Request, runId: string): Response {
  const context = getRuntimeContext();
  const state = activeRuns.get(runId);
  const eventLogPath = state?.eventLogPath ?? buildRunEventLogPath(context.paths.logsDir, runId);
  const lastEventId = parseLastEventId(request, new URL(request.url));
  const encoder = new TextEncoder();

  let closed = false;
  let pingHandle: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

  function cleanup(): void {
    if (closed) {
      return;
    }
    closed = true;
    if (pingHandle) {
      clearInterval(pingHandle);
      pingHandle = undefined;
    }
    unsubscribe?.();
    unsubscribe = undefined;
    try {
      controllerRef?.close();
    } catch {
      // Ignore close races on disconnect.
    }
  }

  function send(controller: ReadableStreamDefaultController<Uint8Array>, envelope: RunReviewEventEnvelope): void {
    if (closed) {
      return;
    }
    try {
      controller.enqueue(encoder.encode(formatSseEvent(envelope)));
      if (isTerminalEvent(envelope.event)) {
        cleanup();
      }
    } catch {
      cleanup();
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      controller.enqueue(encoder.encode("retry: 1500\n"));
      controller.enqueue(encoder.encode(`: connected ${Date.now()}\n\n`));

      try {
        const replayEvents = await readRunEventEnvelopesAfterId(eventLogPath, lastEventId);
        for (const envelope of replayEvents) {
          send(controller, envelope);
          if (closed) {
            return;
          }
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`,
          ),
        );
        cleanup();
        return;
      }

      const liveState = activeRuns.get(runId);
      if (!liveState || liveState.status !== "running") {
        cleanup();
        return;
      }

      const subscriber: Subscriber = (envelope) => {
        send(controller, envelope);
      };
      liveState.subscribers.add(subscriber);
      unsubscribe = () => {
        liveState.subscribers.delete(subscriber);
      };

      pingHandle = setInterval(() => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, 5_000);
      pingHandle.unref?.();

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(),
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

async function handleStartRun(request: Request): Promise<Response> {
  const activeRunningRunIds = getActiveRunningRunIds();
  if (activeRunningRunIds.length > 0) {
    return jsonResponse(
      {
        error: "A run is already in progress",
        activeRunId: activeRunningRunIds[0],
        activeRunIds: activeRunningRunIds,
      },
      409,
    );
  }

  let payload: Record<string, unknown> = {};
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      } else {
        return badRequest("Body must be a JSON object");
      }
    } catch {
      return badRequest("Invalid JSON body");
    }
  }

  const triggerTypeRaw = payload.triggerType;
  const triggerType: TriggerType =
    triggerTypeRaw === undefined
      ? "manual"
      : triggerTypeRaw === "manual" || triggerTypeRaw === "scheduled"
        ? triggerTypeRaw
        : ("" as never);
  if (triggerType !== "manual" && triggerType !== "scheduled") {
    return badRequest("triggerType must be 'manual' or 'scheduled'");
  }

  const dateOverrideRaw = payload.dateOverride ?? payload.date;
  const dateOverride =
    typeof dateOverrideRaw === "string" && dateOverrideRaw.trim() ? dateOverrideRaw.trim() : undefined;
  if (dateOverride && !/^\d{4}-\d{2}-\d{2}$/.test(dateOverride)) {
    return badRequest("dateOverride must use YYYY-MM-DD");
  }

  const scheduleSlotKey =
    typeof payload.scheduleSlotKey === "string" && payload.scheduleSlotKey.trim()
      ? payload.scheduleSlotKey.trim()
      : undefined;

  const started = startRunJob({
    triggerType,
    dateOverride,
    scheduleSlotKey,
  });

  return jsonResponse(
    {
      runId: started.runId,
      status: "started",
      triggerType,
      eventsUrl: `/api/runs/${encodeURIComponent(started.runId)}/events`,
      reportUrl: `/api/runs/${encodeURIComponent(started.runId)}/report`,
    },
    202,
  );
}

async function handleListRuns(): Promise<Response> {
  const context = getRuntimeContext();
  const entries = await readRunLogHistory(context.paths.runLogPath);
  const latestByRunId = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    latestByRunId.set(entry.runId, entry);
  }
  const items = [...latestByRunId.values()].sort((a, b) => {
    const aMs = new Date(a.startedAt).getTime();
    const bMs = new Date(b.startedAt).getTime();
    return bMs - aMs;
  });
  return jsonResponse({
    items,
    activeRunIds: getActiveRunningRunIds(),
  });
}

async function handleGetRunReport(runId: string): Promise<Response> {
  const context = getRuntimeContext();
  const entries = await findRunLogEntriesByRunId(context.paths.runLogPath, runId);
  const latestWithReport = [...entries].reverse().find((entry) => Boolean(entry.reportFilePath));
  if (!latestWithReport?.reportFilePath) {
    return notFound("No report found for this run");
  }

  let markdown: string;
  try {
    markdown = await readFile(latestWithReport.reportFilePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return notFound("Report file no longer exists");
    }
    throw error;
  }

  return jsonResponse({
    runId,
    reportFilePath: latestWithReport.reportFilePath,
    reportStatus: latestWithReport.reportStatus ?? null,
    markdown,
  });
}

function routeRunPath(pathname: string): { runId: string; kind: "events" | "report" } | undefined {
  const match = pathname.match(/^\/api\/runs\/([^/]+)\/(events|report)$/);
  if (!match) {
    return undefined;
  }
  return {
    runId: decodeURIComponent(match[1]),
    kind: match[2] as "events" | "report",
  };
}

const port = Number(process.env.PORT ?? 3001);

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return jsonResponse({ ok: true, ts: new Date().toISOString() });
      }

      if (url.pathname === "/api/runs" && request.method === "GET") {
        return await handleListRuns();
      }

      if (url.pathname === "/api/runs" && request.method === "POST") {
        return await handleStartRun(request);
      }

      const routedRun = routeRunPath(url.pathname);
      if (routedRun) {
        if (routedRun.kind === "events" && request.method === "GET") {
          return buildSseResponse(request, routedRun.runId);
        }
        if (routedRun.kind === "report" && request.method === "GET") {
          return await handleGetRunReport(routedRun.runId);
        }
      }

      return notFound();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      return serverError(message);
    }
  },
});

console.log(`Market monitor API listening on http://localhost:${port}`);
