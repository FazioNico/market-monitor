import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { RunReviewEventEnvelope, RunReviewServiceEvent } from "./run-review-events";
import { ValidationError } from "../shared/errors";

export function buildRunEventLogPath(logsDir: string, runId: string): string {
  return join(logsDir, "run-events", `${runId}.jsonl`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseEnvelope(line: string, index: number): RunReviewEventEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new ValidationError(`Invalid JSONL line at index ${index}`, [
      `Line ${index + 1} is not valid JSON`,
    ]);
  }

  if (!isRecord(parsed)) {
    throw new ValidationError(`Invalid JSONL object at index ${index}`, [
      `Line ${index + 1} must be an object`,
    ]);
  }

  if (typeof parsed.id !== "number" || !Number.isFinite(parsed.id)) {
    throw new ValidationError(`Invalid event id at index ${index}`, [
      `Line ${index + 1} must include numeric id`,
    ]);
  }
  if (typeof parsed.runId !== "string" || !parsed.runId) {
    throw new ValidationError(`Invalid runId at index ${index}`, [
      `Line ${index + 1} must include string runId`,
    ]);
  }
  if (typeof parsed.sentAt !== "string" || !parsed.sentAt) {
    throw new ValidationError(`Invalid sentAt at index ${index}`, [
      `Line ${index + 1} must include string sentAt`,
    ]);
  }
  if (!isRecord(parsed.event) || typeof parsed.event.type !== "string") {
    throw new ValidationError(`Invalid event payload at index ${index}`, [
      `Line ${index + 1} must include event object with type`,
    ]);
  }

  return parsed as unknown as RunReviewEventEnvelope;
}

export async function appendRunEventEnvelope(
  eventLogPath: string,
  envelope: RunReviewEventEnvelope,
): Promise<void> {
  await mkdir(dirname(eventLogPath), { recursive: true });
  await appendFile(eventLogPath, `${JSON.stringify(envelope)}\n`, "utf8");
}

export async function readRunEventEnvelopes(eventLogPath: string): Promise<RunReviewEventEnvelope[]> {
  let contents = "";
  try {
    contents = await readFile(eventLogPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const endedWithNewline = /\r?\n$/.test(contents);
  const rawLines = contents.split(/\r?\n/);
  if (rawLines.at(-1) === "") {
    rawLines.pop();
  }

  const envelopes: RunReviewEventEnvelope[] = [];
  for (const [index, line] of rawLines.entries()) {
    if (!line.trim()) {
      continue;
    }
    try {
      envelopes.push(parseEnvelope(line, index));
    } catch (error) {
      const isLastLine = index === rawLines.length - 1;
      if (isLastLine && !endedWithNewline) {
        // The event log may be read while a writer is still appending the last JSONL frame.
        // Ignore an incomplete trailing line and let the next SSE replay recover it.
        break;
      }
      throw error;
    }
  }

  return envelopes;
}

export async function readRunEventEnvelopesAfterId(
  eventLogPath: string,
  lastEventId?: number,
): Promise<RunReviewEventEnvelope[]> {
  const events = await readRunEventEnvelopes(eventLogPath);
  if (!Number.isFinite(lastEventId)) {
    return events;
  }
  return events.filter((envelope) => envelope.id > (lastEventId as number));
}

export function createRunEventEnvelope(input: {
  id: number;
  runId: string;
  sentAt?: string;
  event: RunReviewServiceEvent;
}): RunReviewEventEnvelope {
  return {
    id: input.id,
    runId: input.runId,
    sentAt: input.sentAt ?? new Date().toISOString(),
    event: input.event,
  };
}
