import type { LiveRunState } from "../types";

import { getOrderedStages } from "../state/live-run";
import { formatDateTime, levelTone, prettyJson } from "../utils/formatters";
import { cx } from "../utils/guards";
import { Panel, StatusBadge } from "./primitives";

export function TimelineCard({
  state,
  compact = false,
}: {
  state?: LiveRunState;
  compact?: boolean;
}) {
  if (!state) {
    return <Panel title="Pipeline Timeline">Select a run to open the stream.</Panel>;
  }

  const orderedStages = getOrderedStages(state);
  return (
    <Panel
      title="Pipeline Timeline"
      subtitle="Pipeline stages completed progressively through streaming"
    >
      {orderedStages.length === 0 ? (
        <div className="text-sm text-zinc-400">
          No events received for this run yet (not started, or historical CLI
          run without event log).
        </div>
      ) : (
        <ol
          className={cx(
            "space-y-3",
            compact && "max-h-[26rem] overflow-auto pr-1",
          )}
        >
          {orderedStages.map((stage) => (
            <li
              key={stage.stage}
              className={cx(
                "relative rounded-xl border border-white/10 bg-white/[0.02] p-3",
                compact && "p-2.5",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      "h-2.5 w-2.5 rounded-full",
                      stage.status === "completed"
                        ? "bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.6)]"
                        : "bg-cyan-300",
                    )}
                  />
                  <span className="text-sm font-medium text-zinc-100">
                    {stage.label}
                  </span>
                </div>
                <StatusBadge status={stage.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
                <span>{formatDateTime(stage.startedAt)}</span>
                {stage.completedAt ? (
                  <span>→ {formatDateTime(stage.completedAt)}</span>
                ) : null}
              </div>
              {stage.metrics ? (
                <pre className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-zinc-300">
                  {prettyJson(stage.metrics)}
                </pre>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function LogsCard({ state }: { state?: LiveRunState }) {
  const rows = state?.logs ?? [];
  return (
    <Panel title="Live Logs" subtitle="System messages and non-fatal errors">
      {rows.length === 0 ? (
        <div className="text-sm text-zinc-400">No logs yet.</div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-xs">
          {rows.map((line, index) => (
            <div
              key={`${line.at}-${index}`}
              className="grid grid-cols-[88px_50px_1fr] gap-2"
            >
              <span className="text-zinc-500">
                {new Date(line.at).toLocaleTimeString("en-US")}
              </span>
              <span
                className={cx("uppercase tracking-wide", levelTone(line.level))}
              >
                {line.level}
              </span>
              <span className="text-zinc-300">{line.message}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function JsonSectionCard({
  title,
  subtitle,
  payload,
  maxHeight = "max-h-80",
}: {
  title: string;
  subtitle?: string;
  payload: unknown;
  maxHeight?: string;
}) {
  return (
    <Panel title={title} subtitle={subtitle}>
      {payload === undefined ? (
        <div className="text-sm text-zinc-400">Pending...</div>
      ) : (
        <pre
          className={cx(
            "overflow-auto rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-300",
            maxHeight,
          )}
        >
          {prettyJson(payload)}
        </pre>
      )}
    </Panel>
  );
}
