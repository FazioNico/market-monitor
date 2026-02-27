import type { RunReviewSectionKey, RunReviewStageKey } from "../../types";
import type { DashboardViewKey } from "./types";

export const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:3001";

export const APP_MODE =
  (import.meta.env.VITE_APP_MODE as string | undefined)?.toLowerCase() ??
  "interactive";

export const IS_PUBLIC_READONLY = APP_MODE === "public";

export const PUBLIC_DATA_BASE_URL = (() => {
  const configured = import.meta.env.VITE_PUBLIC_DATA_BASE_URL as
    | string
    | undefined;
  const base =
    configured && configured.trim().length > 0
      ? configured
      : import.meta.env.BASE_URL;
  return base.endsWith("/") ? base : `${base}/`;
})();

export const GITHUB_OWNER = "FazioNico";
export const GITHUB_REPO = "market-monitor";

export const GITHUB_DEFAULT_BRANCH_CANDIDATES = ["main", "master"] as const;

export const SECTION_READINESS_ITEMS: Array<{
  key: RunReviewSectionKey;
  label: string;
  shortLabel: string;
}> = [
  { key: "config", label: "Config", shortLabel: "CFG" },
  { key: "news", label: "News Intake", shortLabel: "NEWS" },
  { key: "marketSnapshot", label: "Market Snapshot", shortLabel: "MKT" },
  { key: "macroContext", label: "Macro Context", shortLabel: "MAC" },
  { key: "etfFlows", label: "ETF Flows", shortLabel: "ETF" },
  { key: "regime", label: "Regime", shortLabel: "REG" },
  { key: "sentiment", label: "Sentiment", shortLabel: "SENT" },
  { key: "topArticles", label: "Top Articles", shortLabel: "TOP" },
  { key: "outlook", label: "Outlook", shortLabel: "OUT" },
  { key: "riskInvalidation", label: "Risk Invalidation", shortLabel: "RISK" },
  { key: "positionWording", label: "Positioning", shortLabel: "POS" },
  { key: "diagnostics", label: "Diagnostics", shortLabel: "DIAG" },
  { key: "report", label: "Report", shortLabel: "REP" },
];

export const DASHBOARD_VIEWS: Array<{
  key: DashboardViewKey;
  label: string;
  hint: string;
}> = [
  { key: "overview", label: "Overview", hint: "Live essentials" },
  { key: "news", label: "News", hint: "Top articles / briefing" },
  { key: "data", label: "Data", hint: "Market / macro / ingestion" },
  { key: "ops", label: "Ops", hint: "Timeline + logs" },
  { key: "report", label: "Report", hint: "Final markdown" },
];

export const SECTION_STAGE_MAP: Record<RunReviewSectionKey, RunReviewStageKey[]> = {
  config: ["load_config"],
  news: ["fetch_rss"],
  marketSnapshot: ["fetch_market_macro"],
  macroContext: ["fetch_market_macro"],
  etfFlows: ["fetch_market_macro"],
  regime: ["detect_regime"],
  sentiment: ["analyze_sentiment"],
  topArticles: ["rank_top_articles", "summarize_top_articles"],
  outlook: ["build_outlook"],
  riskInvalidation: ["build_risk_invalidation"],
  positionWording: ["generate_positioning"],
  diagnostics: ["render_report"],
  report: ["render_report", "write_report", "finalize_run_log"],
};

export const SOFTWARE_COMMIT_SHA_FALLBACK = "117b1ba";
