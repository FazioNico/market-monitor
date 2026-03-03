import type {
  MarketSnapshotItem,
  NewsImpactLevel,
  NewsItem,
  NewsReadingPriorityList,
  PrioritizedNewsItem,
  RegimeAssessment,
  SentimentAssessment,
} from "../shared/types";

type LlmInvoke = (prompt: { skillDescription: string; context: unknown }) => Promise<unknown>;

interface RankedCandidate {
  candidateId: string;
  item: NewsItem;
  deterministicScore: number;
  recencyHours: number;
  tags: string[];
}

interface LlmRankedCandidate {
  candidateId: string;
  relevanceScore: number;
  sentimentImpact: NewsImpactLevel;
  marketImpact: NewsImpactLevel;
  investorBehaviorImpact: NewsImpactLevel;
  timeHorizon: string;
  rationale: string;
}

export interface NewsReadingPriorityServiceOptions {
  llmInvoke?: LlmInvoke;
  limit?: number;
  now?: Date;
  chunkSize?: number;
  prefilterLimit?: number;
  onLlmError?: (error: unknown) => void;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_CHUNK_SIZE = 60;
const MIN_PREFILTER_LIMIT = 120;
const MAX_PREFILTER_LIMIT = 240;

const KEYWORD_RULES: Array<{ pattern: RegExp; tag: string; weight: number }> = [
  { pattern: /\b(fed|fomc|ecb|boj|central bank|rate hike|rate cut|rates?)\b/i, tag: "policy/rates", weight: 2.2 },
  { pattern: /\b(cpi|inflation|pce|payrolls|nfp|jobs report|gdp|pmi)\b/i, tag: "macro data", weight: 2.0 },
  { pattern: /\b(etf|sec|regulat(?:ion|or)|lawsuit|ban|approval)\b/i, tag: "regulation/ETF", weight: 1.9 },
  { pattern: /\b(liquidation|short squeeze|long squeeze|leverage|margin)\b/i, tag: "positioning/leverage", weight: 1.8 },
  { pattern: /\b(inflows?|outflows?|fund flows?)\b/i, tag: "flows", weight: 1.7 },
  { pattern: /\b(hack|exploit|breach|outage|halt)\b/i, tag: "operational risk", weight: 1.9 },
  { pattern: /\b(bankrupt|default|restructur|insolvenc)\w*\b/i, tag: "credit stress", weight: 2.0 },
  { pattern: /\b(earnings|guidance|revenue|forecast|downgrade|upgrade)\b/i, tag: "earnings/guidance", weight: 1.5 },
  { pattern: /\b(treasury yields?|bond yields?|yield spike|liquidity)\b/i, tag: "rates/liquidity", weight: 1.7 },
  { pattern: /\b(risk-on|risk off|selloff|rally|surge|slump|volatility|vol spike)\b/i, tag: "risk sentiment", weight: 1.4 },
  { pattern: /\b(whale|institutional|hedge fund|options flow|gamma)\b/i, tag: "investor behavior", weight: 1.3 },
];

const GENERIC_PENALTIES: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\b(daily recap|market wrap|price update|morning roundup|what to know)\b/i, weight: -1.2 },
  { pattern: /\b(opinion|editorial|sponsored)\b/i, weight: -0.9 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.trunc(clamp(value, min, max));
}

function parseDateMs(value: string): number | undefined {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

function normalizeTitleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sanitizeRationale(value: string | undefined): string {
  if (!value) {
    return "High reading priority based on expected market/sentiment impact and investor positioning relevance.";
  }
  return value
    .replace(/\s+/g, " ")
    .replace(/\b(amazing|guaranteed|panic|moonshot|must-see)\b/gi, "notable")
    .replace(/!/g, ".")
    .trim()
    .slice(0, 320);
}

function sanitizeTimeHorizon(value: string | undefined): string {
  if (!value || !value.trim()) {
    return "short-term (intraday to few days)";
  }
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

function toImpactLevel(value: unknown, fallback: NewsImpactLevel): NewsImpactLevel {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("h")) return "high";
  if (normalized.startsWith("m")) return "medium";
  if (normalized.startsWith("l")) return "low";
  return fallback;
}

function levelFromScore(score: number): NewsImpactLevel {
  if (score >= 7.6) return "high";
  if (score >= 5.0) return "medium";
  return "low";
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function getField<T = unknown>(input: Record<string, unknown>, keys: string[]): T | undefined {
  for (const key of keys) {
    if (key in input) {
      return input[key] as T;
    }
  }
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function recencyWeight(recencyHours: number): number {
  if (!Number.isFinite(recencyHours)) {
    return 0.6;
  }
  if (recencyHours <= 6) return 2.4;
  if (recencyHours <= 12) return 2.0;
  if (recencyHours <= 24) return 1.6;
  if (recencyHours <= 48) return 1.1;
  if (recencyHours <= 72) return 0.7;
  return 0.3;
}

function extractWatchlistTokens(marketSnapshot: MarketSnapshotItem[]): Set<string> {
  const tokens = new Set<string>();
  for (const item of marketSnapshot) {
    for (const raw of [item.instrumentId]) {
      for (const token of raw
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((value) => value.length >= 3)) {
        tokens.add(token);
      }
    }
  }

  // Common aliases for dominant crypto assets present in watchlists.
  if (tokens.has("btc")) tokens.add("bitcoin");
  if (tokens.has("eth")) tokens.add("ethereum");
  if (tokens.has("sol")) tokens.add("solana");

  return tokens;
}

function scoreCandidate(
  item: NewsItem,
  nowMs: number,
  watchlistTokens: Set<string>,
): { score: number; recencyHours: number; tags: string[] } {
  const publishedAtMs = parseDateMs(item.publishedAt) ?? nowMs;
  const recencyHours = Math.max(0, (nowMs - publishedAtMs) / (60 * 60 * 1000));
  const searchable = `${item.title} ${item.summary} ${item.category}`.toLowerCase();
  const titleLower = item.title.toLowerCase();
  const tags: string[] = [];

  let score = recencyWeight(recencyHours);

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(searchable)) {
      score += rule.weight;
      tags.push(rule.tag);
    }
  }

  for (const penalty of GENERIC_PENALTIES) {
    if (penalty.pattern.test(searchable)) {
      score += penalty.weight;
      tags.push("generic recap");
    }
  }

  let watchlistMatched = false;
  for (const token of watchlistTokens) {
    if (token.length < 3) continue;
    if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(searchable)) {
      watchlistMatched = true;
      break;
    }
  }
  if (watchlistMatched) {
    score += 1.3;
    tags.push("watchlist-linked");
  }

  if (/\bbreaking|urgent|live\b/i.test(titleLower)) {
    score += 0.5;
    tags.push("time-sensitive");
  }

  if (item.source.toLowerCase().includes("sec") || item.source.toLowerCase().includes("federal reserve")) {
    score += 0.6;
    tags.push("primary source");
  }

  const distinctTags = [...new Set(tags)];
  return {
    score: clamp(Number(score.toFixed(1)), 0, 10),
    recencyHours,
    tags: distinctTags,
  };
}

function buildCandidatePool(input: {
  newsItems: NewsItem[];
  marketSnapshot: MarketSnapshotItem[];
  limit: number;
  now: Date;
  prefilterLimit?: number;
}): RankedCandidate[] {
  const nowMs = input.now.getTime();
  const watchlistTokens = extractWatchlistTokens(input.marketSnapshot);
  const targetPrefilter = clampInt(
    input.prefilterLimit ?? Math.max(MIN_PREFILTER_LIMIT, input.limit * 8),
    input.limit,
    MAX_PREFILTER_LIMIT,
  );

  const scored = input.newsItems.map((item, index) => {
    const { score, recencyHours, tags } = scoreCandidate(item, nowMs, watchlistTokens);
    return {
      candidateId: `n_${String(index + 1).padStart(4, "0")}`,
      item,
      deterministicScore: score,
      recencyHours,
      tags,
    } satisfies RankedCandidate;
  });

  scored.sort((a, b) => {
    if (b.deterministicScore !== a.deterministicScore) {
      return b.deterministicScore - a.deterministicScore;
    }
    const aMs = parseDateMs(a.item.publishedAt) ?? 0;
    const bMs = parseDateMs(b.item.publishedAt) ?? 0;
    if (bMs !== aMs) {
      return bMs - aMs;
    }
    return a.item.title.localeCompare(b.item.title);
  });

  return scored.slice(0, Math.min(scored.length, targetPrefilter));
}

function buildDeterministicRationale(candidate: RankedCandidate): string {
  const filteredTags = candidate.tags.filter((tag) => tag !== "generic recap").slice(0, 3);
  const tagText = filteredTags.length > 0 ? filteredTags.join(", ") : "recency + market-sensitive headline signals";
  const recencyText =
    candidate.recencyHours < 6
      ? "very recent"
      : candidate.recencyHours < 24
        ? "recent"
        : "still within review window";
  return `Deterministic fallback (keyword + recency prefilter): ${tagText}. Headline is ${recencyText}.`;
}

function deterministicSelectionFromCandidates(input: {
  candidates: RankedCandidate[];
  totalNewsEvaluated: number;
  limit: number;
  notes?: string[];
}): NewsReadingPriorityList {
  const items: PrioritizedNewsItem[] = input.candidates
    .slice(0, input.limit)
    .map((candidate, index) => toDeterministicPrioritizedNewsItem(candidate, index + 1));

  return {
    method: "deterministic",
    totalNewsEvaluated: input.totalNewsEvaluated,
    candidateNewsEvaluated: input.candidates.length,
    items,
    ...(input.notes && input.notes.length > 0 ? { notes: input.notes } : {}),
  };
}

function toDeterministicPrioritizedNewsItem(candidate: RankedCandidate, rank: number): PrioritizedNewsItem {
  const level = levelFromScore(candidate.deterministicScore);
  const behaviorLevel =
    candidate.tags.includes("positioning/leverage") || candidate.tags.includes("investor behavior")
      ? "high"
      : candidate.tags.includes("flows") || candidate.tags.includes("risk sentiment")
        ? "medium"
        : level;
  return {
    rank,
    title: candidate.item.title,
    source: candidate.item.source,
    publishedAt: candidate.item.publishedAt,
    link: candidate.item.link,
    category: candidate.item.category,
    relevanceScore: candidate.deterministicScore,
    sentimentImpact: candidate.tags.includes("risk sentiment") ? "high" : level,
    marketImpact: level,
    investorBehaviorImpact: behaviorLevel,
    timeHorizon: candidate.recencyHours <= 24 ? "short-term (intraday to few days)" : "multi-day",
    rationale: buildDeterministicRationale(candidate),
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function compactArticleForLlm(candidate: RankedCandidate) {
  return {
    candidate_id: candidate.candidateId,
    title: candidate.item.title.slice(0, 240),
    source: candidate.item.source.slice(0, 80),
    published_at: candidate.item.publishedAt,
    category: candidate.item.category,
    summary: candidate.item.summary.replace(/\s+/g, " ").trim().slice(0, 220),
    link: candidate.item.link,
    heuristic_score: candidate.deterministicScore,
    heuristic_tags: candidate.tags.slice(0, 4),
  };
}

function buildRankingPrompt(input: {
  requestedCount: number;
  roundType: "chunk" | "final";
  totalCandidatesInRound: number;
}): string {
  return [
    "Task: Rank the most important news articles to read now for a market monitoring report.",
    "Primary goal: maximize reading value for (1) market sentiment shifts, (2) price/market impact, and (3) investor behavior/positioning impact.",
    "",
    "Ranking method (apply explicitly):",
    "1. Market impact potential: policy/macro/regulatory/liquidity/event risk and likely price transmission.",
    "2. Sentiment impact: probability the article changes narrative tone or risk appetite.",
    "3. Investor behavior impact: potential effect on positioning, leverage, flows, hedging, de-risking, or chase behavior.",
    "4. Time sensitivity: prioritize what needs to be read now vs background noise.",
    "5. Information density/novelty: prefer specific, actionable developments over generic recaps or duplicate headlines.",
    "",
    "Selection quality rules:",
    "- Penalize duplicate or near-duplicate headlines and generic market wrap content.",
    "- Prefer diversified topics/sources when scores are close.",
    "- Use only the provided metadata/summary. Do not invent facts.",
    "",
    `Round type: ${input.roundType}.`,
    `Candidates in this round: ${input.totalCandidatesInRound}.`,
    `Return exactly up to ${input.requestedCount} items ranked by priority.`,
    "",
    "Output contract (strict): top-level JSON object only.",
    'Required key: "top_articles": array of objects with keys:',
    '- "candidate_id" (must match provided candidate_id exactly)',
    '- "rank" (1-based integer, unique within output)',
    '- "relevance_score" (0-10 number, one decimal preferred)',
    '- "sentiment_impact" ("high" | "medium" | "low")',
    '- "market_impact" ("high" | "medium" | "low")',
    '- "investor_behavior_impact" ("high" | "medium" | "low")',
    '- "time_horizon" (short phrase)',
    '- "why_read" (1 sentence, specific and concise)',
    "No markdown. No commentary. No wrapper fields outside the JSON object.",
    "",
    "Example:",
    JSON.stringify(
      {
        top_articles: [
          {
            candidate_id: "n_0007",
            rank: 1,
            relevance_score: 9.2,
            sentiment_impact: "high",
            market_impact: "high",
            investor_behavior_impact: "medium",
            time_horizon: "intraday to 2 days",
            why_read: "This headline signals a policy/liquidity shift that can quickly reprice risk assets and change positioning.",
          },
        ],
      },
      null,
      2,
    ),
  ].join("\n");
}

function unwrapLlmRankingArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }

  const root = getObject(raw);
  if (!root) {
    return [];
  }

  const directArray = getField<unknown[]>(root, [
    "top_articles",
    "topArticles",
    "articles",
    "picks",
    "selections",
  ]);
  if (Array.isArray(directArray)) {
    return directArray;
  }

  const nested = getObject(getField(root, ["output", "result", "ranking", "selection"]));
  if (!nested) {
    return [];
  }
  const nestedArray = getField<unknown[]>(nested, ["top_articles", "topArticles", "articles", "picks"]);
  return Array.isArray(nestedArray) ? nestedArray : [];
}

function parseLlmRankedCandidates(input: {
  raw: unknown;
  candidates: RankedCandidate[];
  limit: number;
}): LlmRankedCandidate[] {
  const array = unwrapLlmRankingArray(input.raw);
  if (array.length === 0) {
    throw new Error("LLM ranking output missing top_articles array");
  }

  const byId = new Map<string, RankedCandidate>();
  const byTitle = new Map<string, RankedCandidate>();
  for (const candidate of input.candidates) {
    byId.set(candidate.candidateId, candidate);
    byTitle.set(normalizeTitleKey(candidate.item.title), candidate);
  }

  const parsed: Array<LlmRankedCandidate & { sortRank: number }> = [];
  const seen = new Set<string>();

  for (let index = 0; index < array.length; index += 1) {
    const row = getObject(array[index]);
    if (!row) {
      continue;
    }

    const rowCandidateId = parseString(getField(row, ["candidate_id", "candidateId", "id"]));
    const rowTitle = parseString(getField(row, ["title", "headline"]));

    let matchedCandidate = rowCandidateId ? byId.get(rowCandidateId) : undefined;
    if (!matchedCandidate && rowTitle) {
      matchedCandidate = byTitle.get(normalizeTitleKey(rowTitle));
    }
    if (!matchedCandidate || seen.has(matchedCandidate.candidateId)) {
      continue;
    }

    seen.add(matchedCandidate.candidateId);
    const fallbackLevel = levelFromScore(matchedCandidate.deterministicScore);
    const rank = clampInt(parseNumber(getField(row, ["rank", "priority"])) ?? index + 1, 1, 999);
    parsed.push({
      candidateId: matchedCandidate.candidateId,
      sortRank: rank,
      relevanceScore: Number(
        clamp(parseNumber(getField(row, ["relevance_score", "relevanceScore", "score"])) ?? matchedCandidate.deterministicScore, 0, 10).toFixed(1),
      ),
      sentimentImpact: toImpactLevel(
        getField(row, ["sentiment_impact", "sentimentImpact", "sentiment"]),
        matchedCandidate.tags.includes("risk sentiment") ? "high" : fallbackLevel,
      ),
      marketImpact: toImpactLevel(
        getField(row, ["market_impact", "marketImpact", "market"]),
        fallbackLevel,
      ),
      investorBehaviorImpact: toImpactLevel(
        getField(row, ["investor_behavior_impact", "investorBehaviorImpact", "behavior_impact", "behaviour_impact"]),
        matchedCandidate.tags.includes("positioning/leverage") || matchedCandidate.tags.includes("flows")
          ? "high"
          : fallbackLevel,
      ),
      timeHorizon: sanitizeTimeHorizon(
        parseString(getField(row, ["time_horizon", "timeHorizon", "horizon"])),
      ),
      rationale: sanitizeRationale(
        parseString(getField(row, ["why_read", "whyRead", "rationale", "reason"])),
      ),
    });
  }

  if (parsed.length === 0) {
    throw new Error("LLM ranking output did not match any candidate_id");
  }

  parsed.sort((a, b) => {
    if (a.sortRank !== b.sortRank) {
      return a.sortRank - b.sortRank;
    }
    return b.relevanceScore - a.relevanceScore;
  });

  return parsed.slice(0, input.limit).map(({ sortRank: _ignored, ...row }) => row);
}

async function rankCandidatesWithLlm(input: {
  llmInvoke: LlmInvoke;
  candidates: RankedCandidate[];
  requestedCount: number;
  roundType: "chunk" | "final";
  regime: RegimeAssessment;
  marketSnapshot: MarketSnapshotItem[];
  sentiment: SentimentAssessment;
}): Promise<LlmRankedCandidate[]> {
  const raw = await input.llmInvoke({
    skillDescription: buildRankingPrompt({
      requestedCount: input.requestedCount,
      roundType: input.roundType,
      totalCandidatesInRound: input.candidates.length,
    }),
    context: {
      round_type: input.roundType,
      requested_count: input.requestedCount,
      regime: input.regime,
      sentiment: {
        score: input.sentiment.score,
        method: input.sentiment.method,
        narrativeSummary: input.sentiment.narrativeSummary,
        priceActionCoherence: input.sentiment.priceActionCoherence,
      },
      market_snapshot: input.marketSnapshot.map((item) => ({
        instrument_id: item.instrumentId,
        return_24h_pct: item.return24hPct,
        return_7d_pct: item.return7dPct,
        volume_24h: item.volume24h,
      })),
      candidates: input.candidates.map(compactArticleForLlm),
    },
  });

  return parseLlmRankedCandidates({
    raw,
    candidates: input.candidates,
    limit: input.requestedCount,
  });
}

function mergeRankedSelections(
  existing: Map<string, LlmRankedCandidate>,
  additions: LlmRankedCandidate[],
): Map<string, LlmRankedCandidate> {
  for (const next of additions) {
    const current = existing.get(next.candidateId);
    if (!current || next.relevanceScore > current.relevanceScore) {
      existing.set(next.candidateId, next);
    }
  }
  return existing;
}

function toPrioritizedNewsItem(
  candidate: RankedCandidate,
  ranked: LlmRankedCandidate,
  rank: number,
): PrioritizedNewsItem {
  return {
    rank,
    title: candidate.item.title,
    source: candidate.item.source,
    publishedAt: candidate.item.publishedAt,
    link: candidate.item.link,
    category: candidate.item.category,
    relevanceScore: Number(clamp(ranked.relevanceScore, 0, 10).toFixed(1)),
    sentimentImpact: ranked.sentimentImpact,
    marketImpact: ranked.marketImpact,
    investorBehaviorImpact: ranked.investorBehaviorImpact,
    timeHorizon: sanitizeTimeHorizon(ranked.timeHorizon),
    rationale: sanitizeRationale(ranked.rationale),
  };
}

function ensureTargetCountWithDeterministicFallback(input: {
  items: PrioritizedNewsItem[];
  candidatePool: RankedCandidate[];
  limit: number;
}): PrioritizedNewsItem[] {
  const target = Math.min(input.limit, input.candidatePool.length);
  if (input.items.length >= target) {
    return input.items.slice(0, target);
  }

  const seen = new Set(input.items.map((item) => item.link));
  const filled = [...input.items];
  for (const candidate of input.candidatePool) {
    if (seen.has(candidate.item.link)) {
      continue;
    }
    filled.push(toDeterministicPrioritizedNewsItem(candidate, filled.length + 1));
    seen.add(candidate.item.link);
    if (filled.length >= target) {
      break;
    }
  }
  return filled;
}

function sortMergedByScoreAndRecency(
  candidatePool: RankedCandidate[],
  merged: Map<string, LlmRankedCandidate>,
): RankedCandidate[] {
  const candidateById = new Map(candidatePool.map((candidate) => [candidate.candidateId, candidate] as const));
  const list = Array.from(merged.keys())
    .map((id) => candidateById.get(id))
    .filter((candidate): candidate is RankedCandidate => Boolean(candidate));
  list.sort((a, b) => {
    const aMeta = merged.get(a.candidateId);
    const bMeta = merged.get(b.candidateId);
    const aScore = aMeta?.relevanceScore ?? a.deterministicScore;
    const bScore = bMeta?.relevanceScore ?? b.deterministicScore;
    if (bScore !== aScore) {
      return bScore - aScore;
    }
    const aMs = parseDateMs(a.item.publishedAt) ?? 0;
    const bMs = parseDateMs(b.item.publishedAt) ?? 0;
    return bMs - aMs;
  });
  return list;
}

export async function buildNewsReadingPriorityList(
  context: {
    newsItems: NewsItem[];
    marketSnapshot: MarketSnapshotItem[];
    regime: RegimeAssessment;
    sentiment: SentimentAssessment;
  },
  options: NewsReadingPriorityServiceOptions = {},
): Promise<NewsReadingPriorityList> {
  const limit = clampInt(options.limit ?? DEFAULT_LIMIT, 1, 50);
  const now = options.now ?? new Date();
  const candidatePool = buildCandidatePool({
    newsItems: context.newsItems,
    marketSnapshot: context.marketSnapshot,
    limit,
    now,
    prefilterLimit: options.prefilterLimit,
  });

  if (candidatePool.length === 0) {
    return {
      method: "deterministic",
      totalNewsEvaluated: context.newsItems.length,
      candidateNewsEvaluated: 0,
      items: [],
      notes: ["No articles available in the configured lookback window."],
    };
  }

  if (!options.llmInvoke) {
    return deterministicSelectionFromCandidates({
      candidates: candidatePool,
      totalNewsEvaluated: context.newsItems.length,
      limit,
      notes: ["LLM ranking unavailable: deterministic prefilter ranking used."],
    });
  }

  try {
    const chunkSize = clampInt(options.chunkSize ?? DEFAULT_CHUNK_SIZE, 10, 100);
    const candidateById = new Map(candidatePool.map((candidate) => [candidate.candidateId, candidate] as const));

    if (candidatePool.length <= chunkSize) {
      const ranked = await rankCandidatesWithLlm({
        llmInvoke: options.llmInvoke,
        candidates: candidatePool,
        requestedCount: Math.min(limit, candidatePool.length),
        roundType: "final",
        regime: context.regime,
        marketSnapshot: context.marketSnapshot,
        sentiment: context.sentiment,
      });

      const items = ranked
        .map((row, index) => {
          const candidate = candidateById.get(row.candidateId);
          return candidate ? toPrioritizedNewsItem(candidate, row, index + 1) : undefined;
        })
        .filter((item): item is PrioritizedNewsItem => Boolean(item))
        .slice(0, limit);
      const completedItems = ensureTargetCountWithDeterministicFallback({
        items,
        candidatePool,
        limit,
      });

      return {
        method: "llm_single_pass",
        totalNewsEvaluated: context.newsItems.length,
        candidateNewsEvaluated: candidatePool.length,
        items: completedItems,
        notes:
          completedItems.length > items.length
            ? [`LLM returned ${items.length} prioritized items; deterministic fallback filled the remainder to ${completedItems.length}.`]
            : undefined,
      };
    }

    const chunks = chunkArray(candidatePool, chunkSize);
    const perChunkTarget = clampInt(Math.ceil((limit * 2.2) / chunks.length) + 3, 4, 12);
    const merged = new Map<string, LlmRankedCandidate>();

    for (const chunk of chunks) {
      const chunkRanked = await rankCandidatesWithLlm({
        llmInvoke: options.llmInvoke,
        candidates: chunk,
        requestedCount: Math.min(perChunkTarget, chunk.length),
        roundType: "chunk",
        regime: context.regime,
        marketSnapshot: context.marketSnapshot,
        sentiment: context.sentiment,
      });
      mergeRankedSelections(merged, chunkRanked);
    }

    let finalists = sortMergedByScoreAndRecency(candidatePool, merged);
    const finalistTarget = Math.min(candidatePool.length, Math.max(limit * 2, 32));
    if (finalists.length < finalistTarget) {
      for (const candidate of candidatePool) {
        if (merged.has(candidate.candidateId)) continue;
        finalists.push(candidate);
        if (finalists.length >= finalistTarget) break;
      }
    }
    finalists = finalists.slice(0, finalistTarget);

    const finalRanked = await rankCandidatesWithLlm({
      llmInvoke: options.llmInvoke,
      candidates: finalists,
      requestedCount: Math.min(limit, finalists.length),
      roundType: "final",
      regime: context.regime,
      marketSnapshot: context.marketSnapshot,
      sentiment: context.sentiment,
    });

    const items = finalRanked
      .map((row, index) => {
        const candidate = candidateById.get(row.candidateId);
        return candidate ? toPrioritizedNewsItem(candidate, row, index + 1) : undefined;
      })
      .filter((item): item is PrioritizedNewsItem => Boolean(item))
      .slice(0, limit);
    const completedItems = ensureTargetCountWithDeterministicFallback({
      items,
      candidatePool,
      limit,
    });

    if (completedItems.length === 0) {
      throw new Error("LLM ranking produced no usable prioritized articles");
    }

    const notes: string[] = [];
    if (context.newsItems.length > candidatePool.length) {
      notes.push(
        `LLM evaluated a prefiltered candidate pool (${candidatePool.length}) from ${context.newsItems.length} extracted articles.`,
      );
    }
    if (completedItems.length > items.length) {
      notes.push(`LLM returned ${items.length} prioritized items; deterministic fallback filled the remainder.`);
    }

    return {
      method: "llm_chunked",
      totalNewsEvaluated: context.newsItems.length,
      candidateNewsEvaluated: candidatePool.length,
      items: completedItems,
      notes: notes.length > 0 ? notes : undefined,
    };
  } catch (error) {
    options.onLlmError?.(error);
    return deterministicSelectionFromCandidates({
      candidates: candidatePool,
      totalNewsEvaluated: context.newsItems.length,
      limit,
      notes: ["LLM ranking failed: deterministic prefilter ranking used instead."],
    });
  }
}
