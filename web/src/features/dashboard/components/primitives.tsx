import type { ReactNode } from "react";

import { DASHBOARD_VIEWS } from "../constants";
import type { ConnectionState, DashboardViewKey } from "../types";
import { statusTone } from "../utils/formatters";
import { cx } from "../utils/guards";

export function ConnectionBadge({ status }: { status: ConnectionState }) {
  const label = status === "reconnecting" ? "reconnect" : status;
  const tone =
    status === "live"
      ? "bg-emerald-400"
      : status === "connecting" || status === "reconnecting"
        ? "bg-cyan-400"
        : status === "error"
          ? "bg-rose-400"
          : "bg-zinc-500";
  return (
    <div className="data-pill gap-2">
      <span className={cx("status-dot", tone)} />
      <span className="font-mono text-[11px] uppercase tracking-[0.2em]">
        {label}
      </span>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cx("data-pill border", statusTone(status), "capitalize")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("panel min-w-0", className)}>
      <header className="panel-header flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm uppercase tracking-[0.22em] text-zinc-100">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-zinc-400">{subtitle}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function ViewTabs({
  value,
  onChange,
}: {
  value: DashboardViewKey;
  onChange: (next: DashboardViewKey) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-body">
        <div className="flex flex-wrap gap-2">
          {DASHBOARD_VIEWS.map((view) => {
            const active = value === view.key;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => onChange(view.key)}
                className={cx(
                  "rounded-xl border px-3 py-2 text-left transition",
                  active
                    ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100 shadow-glow"
                    : "border-white/10 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05]",
                )}
              >
                <div className="text-xs font-medium uppercase tracking-[0.16em]">
                  {view.label}
                </div>
                <div className="mt-1 text-[11px] text-zinc-400">{view.hint}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function RevealIn({
  children,
  delayMs = 0,
  className,
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  return (
    <div
      className={cx("enter-up motion-reduce:animate-none", className)}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
