import { join } from "node:path";

import type { RuntimePaths, TriggerType } from "../shared/types";
import { appendRunLogEntry, createSkippedDuplicateRunLogEntry, createStartedRunLogEntry } from "./run-log";
import { acquireRunLock, buildRunLockPath } from "./run-lock";

export interface SchedulerTime {
  hour: number;
  minute: number;
}

export function parseScheduleTime(value: string): SchedulerTime {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Invalid schedule time format (expected HH:mm)");
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("Invalid schedule time value");
  }
  return { hour, minute };
}

export function formatSchedulerSlotKey(date: Date, scheduleTime: string): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}@${scheduleTime}`;
}

export function isSchedulerSlotDue(date: Date, scheduleTime: string): boolean {
  const slot = parseScheduleTime(scheduleTime);
  return date.getHours() > slot.hour || (date.getHours() === slot.hour && date.getMinutes() >= slot.minute);
}

export interface SchedulerTickResult {
  status: "not_due" | "started" | "skipped_duplicate" | "failed";
  slotKey: string;
  reviewExitCode?: number;
}

export async function runSchedulerTick(input: {
  paths: RuntimePaths;
  scheduleTime: string;
  now?: Date;
  runReview: (options: { triggerType: TriggerType; scheduleSlotKey: string }) => Promise<number>;
}): Promise<SchedulerTickResult> {
  const now = input.now ?? new Date();
  const slotKey = formatSchedulerSlotKey(now, input.scheduleTime);

  if (!isSchedulerSlotDue(now, input.scheduleTime)) {
    return { status: "not_due", slotKey };
  }

  const lockPath = buildRunLockPath(join(input.paths.logsDir, "locks"), slotKey);
  const lock = await acquireRunLock({
    lockPath,
    lockKey: slotKey,
    runId: `scheduler_${slotKey}`,
    now,
    ttlMs: 26 * 60 * 60 * 1000,
  });

  if (!lock.acquired) {
    await appendRunLogEntry(
      input.paths.runLogPath,
      createSkippedDuplicateRunLogEntry({
        runId: `scheduler_${slotKey}`,
        startedAt: now.toISOString(),
        message: `duplicate scheduled run skipped for slot ${slotKey}`,
      }),
    );
    return { status: "skipped_duplicate", slotKey };
  }

  await appendRunLogEntry(
    input.paths.runLogPath,
    createStartedRunLogEntry({
      runId: `scheduler_${slotKey}`,
      triggerType: "scheduled",
      startedAt: now.toISOString(),
      messages: [`scheduler slot due: ${slotKey}`],
    }),
  );

  const reviewExitCode = await input.runReview({
    triggerType: "scheduled",
    scheduleSlotKey: slotKey,
  });

  return {
    status: reviewExitCode === 0 ? "started" : "failed",
    slotKey,
    reviewExitCode,
  };
}

export interface SchedulerLoopHandle {
  stop(): void;
}

export function startSchedulerLoop(input: {
  intervalMs?: number;
  onTick: () => Promise<void>;
}): SchedulerLoopHandle {
  const intervalMs = input.intervalMs ?? 30_000;
  const timer = setInterval(() => {
    void input.onTick();
  }, intervalMs);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
