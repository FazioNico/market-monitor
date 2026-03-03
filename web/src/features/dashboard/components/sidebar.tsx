import { useState } from "react";

import type { RunListItem } from "../../../types";
import type { ConnectionState, TriggerType } from "../types";
import { formatDateTime } from "../utils/formatters";
import { cx } from "../utils/guards";
import { ConnectionBadge, Panel, StatusBadge } from "./primitives";

export function RunListPanel({
  runs,
  selectedRunId,
  onSelect,
  onRefresh,
  loading,
}: {
  runs: RunListItem[];
  selectedRunId?: string;
  onSelect: (runId: string) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <Panel
      title="Runs"
      subtitle="History from run-log (CLI + Web)"
      actions={
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/[0.06]"
        >
          {loading ? "Refresh..." : "Refresh"}
        </button>
      }
      className="h-full lg:max-h-[calc(100vh-24rem)]"
    >
      <div className="space-y-2 lg:max-h-[calc(100vh-31rem)] lg:overflow-auto lg:pr-1">
        {runs.length === 0 ? (
          <div className="text-sm text-zinc-400">No runs found.</div>
        ) : (
          runs.map((run) => (
            <button
              key={`${run.runId}-${run.startedAt}`}
              type="button"
              onClick={() => onSelect(run.runId)}
              className={cx(
                "w-full rounded-xl border px-3 py-3 text-left transition",
                selectedRunId === run.runId
                  ? "border-cyan-300/30 bg-cyan-400/10 shadow-glow"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-zinc-200">
                  {run.runId}
                </span>
                <StatusBadge status={run.status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                <span>{run.triggerType}</span>
                <span className="text-right">{formatDateTime(run.startedAt)}</span>
              </div>
              {run.reportStatus ? (
                <div className="mt-2 text-xs text-zinc-400">
                  report: {run.reportStatus}
                </div>
              ) : null}
            </button>
          ))
        )}
      </div>
    </Panel>
  );
}

export function ControlsPanel({
  onStartRun,
  starting,
  connectionState,
  launchDisabled,
  launchDisabledReason,
  apiBase,
}: {
  onStartRun: (input: {
    triggerType: TriggerType;
    dateOverride?: string;
    scheduleSlotKey?: string;
  }) => Promise<void>;
  starting: boolean;
  connectionState: ConnectionState;
  launchDisabled: boolean;
  launchDisabledReason?: string;
  apiBase: string;
}) {
  const [triggerType, setTriggerType] = useState<TriggerType>("manual");
  const [dateOverride, setDateOverride] = useState("");
  const [scheduleSlotKey, setScheduleSlotKey] = useState("");

  return (
    <Panel
      title="Control Surface"
      subtitle="Start a run and follow section updates live"
      actions={<ConnectionBadge status={connectionState} />}
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onStartRun({
            triggerType,
            dateOverride: dateOverride.trim() || undefined,
            scheduleSlotKey: scheduleSlotKey.trim() || undefined,
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-zinc-400">
              Trigger
            </span>
            <select
              value={triggerType}
              onChange={(event) =>
                setTriggerType(event.target.value as TriggerType)
              }
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300/40"
            >
              <option value="manual">manual</option>
              <option value="scheduled">scheduled</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-zinc-400">
              Date override
            </span>
            <input
              type="date"
              value={dateOverride}
              onChange={(event) => setDateOverride(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-300/40"
            />
          </label>
        </div>
        {triggerType === "scheduled" ? (
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-zinc-400">
              Schedule slot key
            </span>
            <input
              value={scheduleSlotKey}
              onChange={(event) => setScheduleSlotKey(event.target.value)}
              placeholder="2026-02-25T08:00"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-300/40"
            />
          </label>
        ) : null}
        <button
          type="submit"
          disabled={starting || launchDisabled}
          className={cx(
            "relative inline-flex w-full items-center justify-center overflow-hidden rounded-xl border px-4 py-2.5 text-sm font-medium transition",
            starting || launchDisabled
              ? "cursor-not-allowed border-white/10 bg-white/[0.03] text-zinc-500"
              : "border-cyan-300/25 bg-gradient-to-r from-cyan-400/20 to-steel-400/20 text-cyan-100 hover:from-cyan-400/25 hover:to-gold-400/20",
          )}
        >
          {!starting && !launchDisabled ? (
            <span className="pointer-events-none absolute inset-0 opacity-40 [mask-image:linear-gradient(to_right,transparent,black,transparent)] animate-sweep bg-gradient-to-r from-transparent via-white to-transparent" />
          ) : null}
          <span className="relative">
            {starting
              ? "Starting..."
              : launchDisabled
                ? "Run in progress..."
                : "Start run"}
          </span>
        </button>
      </form>
      {launchDisabledReason ? (
        <p className="mt-3 rounded-lg border border-amber-300/15 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
          {launchDisabledReason}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-zinc-400">
        API target: <span className="font-mono text-zinc-300">{apiBase}</span>
      </p>
    </Panel>
  );
}
