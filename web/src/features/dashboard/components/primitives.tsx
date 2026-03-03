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
  const activeView =
    DASHBOARD_VIEWS.find((view) => view.key === value) ?? {
      key: "overview",
      label: "Overview",
      hint: "Live essentials",
    };

  return (
    <div className="panel panel-strong">
      <div className="panel-body">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-cyan-200/80">
              Navigate
            </div>
          </div>
          <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-300">
            {activeView.label}
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Dashboard views"
          className="flex flex-wrap gap-2"
        >
          {DASHBOARD_VIEWS.map((view) => {
            const active = value === view.key;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => onChange(view.key)}
                role="tab"
                aria-selected={active}
                className={cx(
                  "group relative min-w-[122px] flex-1 overflow-hidden rounded-xl border px-3 py-2 text-left transition duration-150 sm:min-w-[0] sm:flex-none",
                  active
                    ? "border-cyan-300/35 bg-cyan-400/[0.14] text-cyan-100 shadow-glow"
                    : "border-white/10 bg-black/20 text-zinc-300 hover:border-white/15 hover:bg-white/[0.05]",
                )}
              >
                <span
                  className={cx(
                    "pointer-events-none absolute inset-y-0 left-0 w-1 transition",
                    active ? "bg-cyan-300" : "bg-transparent group-hover:bg-white/10",
                  )}
                />
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {view.label}
                  </span>
                  <span
                    className={cx(
                      "mt-0.5 block text-[10px]",
                      active ? "text-cyan-100/75" : "text-zinc-400",
                    )}
                  >
                    {view.hint}
                  </span>
                </div>
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
