import type { LiveLogLine } from "../types";

export function formatDateTime(value?: string): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export function formatUtcDateTimeMinute(value?: string): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

export function formatDurationMs(ms?: number): string {
  if (!Number.isFinite(ms)) return "n/a";
  const totalSeconds = Math.floor((ms ?? 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function statusTone(status: string): string {
  if (status === "completed" || status === "success")
    return "text-emerald-300 border-emerald-300/20 bg-emerald-400/10";
  if (status === "failed")
    return "text-rose-300 border-rose-300/20 bg-rose-400/10";
  if (status === "running" || status === "started")
    return "text-cyan-200 border-cyan-300/20 bg-cyan-400/10";
  if (status === "partial_success")
    return "text-amber-200 border-amber-300/20 bg-amber-400/10";
  if (status === "skipped_duplicate")
    return "text-zinc-300 border-zinc-300/15 bg-white/5";
  return "text-zinc-300 border-white/10 bg-white/5";
}

export function levelTone(level: LiveLogLine["level"]): string {
  if (level === "error") return "text-rose-300";
  if (level === "warn") return "text-amber-200";
  return "text-zinc-300";
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatUsdMillions(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "N/A";
  }
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(1)} US$m`;
}

export function etfFlowDirection(
  value: number | null | undefined,
): "inflow" | "outflow" | "flat" | "n/a" {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  if (value > 0) return "inflow";
  if (value < 0) return "outflow";
  return "flat";
}

export function formatEtfAssetLabel(asset?: string): string {
  if (!asset) return "ETF Flows";
  return `${asset.toUpperCase()} Spot ETF Flows`;
}
