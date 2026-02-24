import type {
  MarketSnapshotItem,
  NewsItem,
  RegimeAssessment,
  SentimentAssessment,
  SkillDefinition,
} from "../shared/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface SentimentServiceOptions {
  llmBinding?: (context: {
    newsItems: NewsItem[];
    marketSnapshot: MarketSnapshotItem[];
    regime: RegimeAssessment;
  }) => Promise<SentimentAssessment>;
  skillExecution?: {
    skill: SkillDefinition;
    execute(payload: {
      newsItems: NewsItem[];
      marketSnapshot: MarketSnapshotItem[];
      regime: RegimeAssessment;
    }): Promise<unknown>;
  };
  onLlmError?: (error: unknown) => void;
}

function sanitizeNarrative(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }
  return input
    .replace(/\b(amazing|terrified|panic|euphoria|moonshot)\b/gi, "measured")
    .replace(/!/g, ".")
    .trim();
}

function getField<T = unknown>(data: Record<string, unknown>, keys: string[]): T | undefined {
  for (const key of keys) {
    if (key in data) {
      return data[key] as T;
    }
  }
  return undefined;
}

function unwrapSentimentPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const root = raw as Record<string, unknown>;
  const nested = getField<Record<string, unknown>>(root, [
    "sentimentAssessment",
    "sentiment_assessment",
    "sentiment",
    "output",
    "result",
  ]);

  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested;
  }

  return root;
}

function parseScore(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(Number(value.toFixed(2)), -2, 2);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return clamp(Number(parsed.toFixed(2)), -2, 2);
    }
  }
  return 0;
}

function normalizeLlmSentimentOutput(raw: unknown): SentimentAssessment {
  const data = unwrapSentimentPayload(raw);
  const scoreValue = parseScore(getField(data, ["score", "sentimentScore", "sentiment_score"]));
  const narrativeValue = getField<string>(data, ["narrativeSummary", "narrative_summary", "summary"]);
  const coherenceValue = getField<string>(data, [
    "priceActionCoherence",
    "price_action_coherence",
    "coherence",
  ]);
  const coherence =
    typeof coherenceValue === "string" && coherenceValue.trim().length > 0
      ? sanitizeNarrative(coherenceValue) ?? "Coherence assessment unavailable."
      : "Coherence assessment unavailable.";
  return {
    score: scoreValue,
    method: "llm_assisted",
    narrativeSummary: sanitizeNarrative(typeof narrativeValue === "string" ? narrativeValue : undefined),
    priceActionCoherence: coherence,
    status: "complete",
  };
}

export async function generateSentimentAssessment(
  context: {
    newsItems: NewsItem[];
    marketSnapshot: MarketSnapshotItem[];
    regime: RegimeAssessment;
  },
  options: SentimentServiceOptions = {},
): Promise<SentimentAssessment> {
  if (options.skillExecution) {
    try {
      const raw = await options.skillExecution.execute(context);
      return normalizeLlmSentimentOutput(raw);
    } catch (error) {
      options.onLlmError?.(error);
      return {
        method: "llm_assisted",
        priceActionCoherence: "LLM skill binding failed before coherence assessment",
        status: "omitted_llm_failure",
      };
    }
  }

  if (options.llmBinding) {
    try {
      return normalizeLlmSentimentOutput(await options.llmBinding(context));
    } catch (error) {
      options.onLlmError?.(error);
      return {
        method: "llm_assisted",
        priceActionCoherence: "LLM binding failed before coherence assessment",
        status: "omitted_llm_failure",
      };
    }
  }

  const avg24h = average(context.marketSnapshot.map((item) => item.return24hPct));
  const keywordBias = context.newsItems.reduce((score, item) => {
    const t = item.title.toLowerCase();
    if (/\b(rebound|surge|gain|rally)\b/.test(t)) {
      return score + 0.3;
    }
    if (/\b(drop|selloff|slump|risk-off)\b/.test(t)) {
      return score - 0.3;
    }
    return score;
  }, 0);
  const score = clamp(Number((avg24h / 5 + keywordBias).toFixed(2)), -2, 2);

  return {
    score,
    method: "deterministic",
    narrativeSummary: `Deterministic baseline sentiment is ${score >= 0 ? "constructive" : "cautious"} based on recent price action and headline tone.`,
    priceActionCoherence: avg24h >= 0 ? "Headlines broadly align with positive price action." : "Headline tone mixed vs weaker price action.",
    status: "complete",
  };
}
