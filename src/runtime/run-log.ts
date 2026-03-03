import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { ValidationError } from "../shared/errors";
import type { RunLogEntry, TriggerType } from "../shared/types";
import { ensureStringArray, isRecord } from "../shared/validation";

function requireStringField(
  record: Record<string, unknown>,
  fieldName: "runId" | "triggerType" | "startedAt" | "status",
  index: number,
): void {
  if (typeof record[fieldName] !== "string") {
    throw new ValidationError(`Invalid ${fieldName} at index ${index}`, [
      `Line ${index + 1} must include string ${fieldName}`,
    ]);
  }
}

function validateRunLogEntry(entry: RunLogEntry): void {
  const issues: string[] = [];

  if (!entry.runId) {
    issues.push("runId is required");
  }
  if (!entry.triggerType) {
    issues.push("triggerType is required");
  }
  if (!entry.startedAt) {
    issues.push("startedAt is required");
  }
  if (!entry.status) {
    issues.push("status is required");
  }
  if (!Array.isArray(entry.messages)) {
    issues.push("messages must be an array");
  }

  if (issues.length > 0) {
    throw new ValidationError("Invalid run log entry", issues);
  }
}

export async function appendRunLogEntry(runLogPath: string, entry: RunLogEntry): Promise<void> {
  validateRunLogEntry(entry);
  await mkdir(dirname(runLogPath), { recursive: true });
  await appendFile(runLogPath, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function readRunLogEntries(runLogPath: string): Promise<RunLogEntry[]> {
  let contents = "";

  try {
    contents = await readFile(runLogPath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const entries: RunLogEntry[] = [];
  const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);

  for (const [index, line] of lines.entries()) {
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
        `Line ${index + 1} must be a JSON object`,
      ]);
    }

    requireStringField(parsed, "runId", index);
    requireStringField(parsed, "triggerType", index);
    requireStringField(parsed, "startedAt", index);
    requireStringField(parsed, "status", index);

    ensureStringArray(parsed.messages, "messages");
    entries.push(parsed as unknown as RunLogEntry);
  }

  return entries;
}

export async function readRunLogHistory(runLogPath: string): Promise<RunLogEntry[]> {
  return readRunLogEntries(runLogPath);
}

export async function findRunLogEntriesByStatus(
  runLogPath: string,
  status: RunLogEntry["status"],
): Promise<RunLogEntry[]> {
  const entries = await readRunLogEntries(runLogPath);
  return entries.filter((entry) => entry.status === status);
}

export async function findRunLogEntriesByRunId(runLogPath: string, runId: string): Promise<RunLogEntry[]> {
  const entries = await readRunLogEntries(runLogPath);
  return entries.filter((entry) => entry.runId === runId);
}

export function createStartedRunLogEntry(input: {
  runId: string;
  triggerType: TriggerType;
  startedAt?: string;
  messages?: string[];
}): RunLogEntry {
  return {
    runId: input.runId,
    triggerType: input.triggerType,
    startedAt: input.startedAt ?? new Date().toISOString(),
    status: "started",
    messages: input.messages ?? [],
  };
}

export function createSkippedDuplicateRunLogEntry(input: {
  runId: string;
  startedAt?: string;
  message?: string;
}): RunLogEntry {
  const ts = input.startedAt ?? new Date().toISOString();
  return {
    runId: input.runId,
    triggerType: "scheduled",
    startedAt: ts,
    endedAt: ts,
    status: "skipped_duplicate",
    llmStatus: "not_used",
    messages: [input.message ?? "duplicate scheduled run skipped"],
  };
}
