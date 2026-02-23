import type { AppClock } from "./types";

export function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatLocalTimeHm(date: Date): string {
  return `${pad2(date.getHours())}-${pad2(date.getMinutes())}`;
}

export function formatLocalDateLabel(date: Date): string {
  return formatLocalDate(date);
}

export function formatLocalDateTimeLabel(date: Date): string {
  return `${formatLocalDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function createSystemClock(): AppClock {
  return {
    now: () => new Date(),
    nowIso: () => new Date().toISOString(),
    localDateLabel: (date = new Date()) => formatLocalDate(date),
    localTimeLabel: (date = new Date()) => formatLocalTimeHm(date),
  };
}
