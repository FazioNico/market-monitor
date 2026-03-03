import { ValidationError } from "../shared/errors";
import type { LlmInvokePrompt } from "./types";

export interface GeminiInvokeOptions {
  model: string;
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_GEMINI_TIMEOUT_MS = 90_000;
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_RETRY_429_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 2_000;
const DEFAULT_RETRY_MAX_MS = 65_000;

function supportsJsonMode(model: string): boolean {
  return !model.toLowerCase().startsWith("gemma-");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.trunc(seconds * 1_000);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 0;
  }
  return undefined;
}

function computeRetryDelayMs(input: {
  attempt: number;
  retryAfterMs?: number;
  responseBodySnippet: string;
}): number {
  if (typeof input.retryAfterMs === "number") {
    return Math.min(DEFAULT_RETRY_MAX_MS, Math.max(500, input.retryAfterMs));
  }

  const looksLikeMinuteQuota = /token.*minute|per minute|quota|rate limit/i.test(input.responseBodySnippet);
  if (looksLikeMinuteQuota) {
    return DEFAULT_RETRY_MAX_MS;
  }

  const exponential = Math.min(DEFAULT_RETRY_MAX_MS, DEFAULT_RETRY_BASE_MS * 2 ** input.attempt);
  const jitter = Math.floor(Math.random() * 600);
  return exponential + jitter;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildPromptText(prompt: LlmInvokePrompt): string {
  return [
    "You are a structured output assistant. Return JSON only, with no markdown fences and no commentary.",
    "",
    `Skill description: ${prompt.skillDescription}`,
    "Context JSON:",
    JSON.stringify(prompt.context),
    "Return a compact JSON object matching the requested task.",
  ].join("\n");
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractGeminiText(payload: unknown): string {
  const candidates = (payload as any)?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new ValidationError("Invalid Gemini response payload", [
      "Expected a non-empty candidates array",
    ]);
  }

  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new ValidationError("Invalid Gemini response payload", [
      "Expected candidates[0].content.parts array",
    ]);
  }

  const text = parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw new ValidationError("Invalid Gemini response payload", [
      "Expected non-empty text in candidates[0].content.parts",
    ]);
  }

  return text;
}

function parseGeminiPayload(payload: unknown): unknown {
  const jsonText = stripCodeFences(extractGeminiText(payload));
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new ValidationError("Invalid JSON returned by Gemini", [
      "LLM response was not valid JSON",
      `Snippet: ${jsonText.slice(0, 200)}`,
    ]);
  }
}

export function createGeminiInvoke(options: GeminiInvokeOptions) {
  const model = options.model.trim();
  const apiKey = options.apiKey.trim();
  const baseUrl = trimTrailingSlash((options.baseUrl ?? DEFAULT_GEMINI_BASE_URL).trim());

  if (!model) {
    throw new ValidationError("LLM_MODEL is required for Gemini");
  }
  if (!apiKey) {
    throw new ValidationError("LLM_API_KEY is required for Gemini");
  }

  const fetchFn = options.fetchFn ?? fetch;
  const jsonModeEnabled = supportsJsonMode(model);

  return async (prompt: LlmInvokePrompt): Promise<unknown> => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS;
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      try {
        const response = await fetchFn(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: buildPromptText(prompt) }],
              },
            ],
            ...(jsonModeEnabled
              ? {
                  generationConfig: {
                    responseMimeType: "application/json",
                  },
                }
              : {}),
          }),
        });

        const rawText = await response.text();
        if (!response.ok) {
          if (response.status === 429 && attempt < DEFAULT_RETRY_429_MAX_ATTEMPTS) {
            const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
            const delayMs = computeRetryDelayMs({
              attempt,
              retryAfterMs,
              responseBodySnippet: rawText.slice(0, 400),
            });
            await sleep(delayMs);
            continue;
          }

          throw new ValidationError("Gemini request failed", [
            `HTTP ${response.status}`,
            rawText.slice(0, 300),
          ]);
        }

        let payload: unknown;
        try {
          payload = JSON.parse(rawText);
        } catch {
          throw new ValidationError("Invalid Gemini HTTP response", ["Response was not valid JSON"]);
        }

        return parseGeminiPayload(payload);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
