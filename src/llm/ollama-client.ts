import { ValidationError } from "../shared/errors";

export interface LlmInvokePrompt {
  skillDescription: string;
  context: unknown;
}

export interface OllamaInvokeOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildPromptMessages(prompt: LlmInvokePrompt): Array<{ role: "system" | "user"; content: string }> {
  return [
    {
      role: "system",
      content:
        "You are a structured output assistant. Return JSON only, with no markdown fences and no commentary.",
    },
    {
      role: "user",
      content: [
        `Skill description: ${prompt.skillDescription}`,
        "Context JSON:",
        JSON.stringify(prompt.context),
        "Return a compact JSON object matching the requested task.",
      ].join("\n"),
    },
  ];
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1]?.trim() ?? trimmed;
}

function parseOllamaPayload(payload: unknown): unknown {
  const content =
    (payload as any)?.message?.content ??
    (payload as any)?.response;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new ValidationError("Invalid Ollama response payload", [
      "Expected message.content or response string in Ollama JSON response",
    ]);
  }

  const jsonText = stripCodeFences(content);
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new ValidationError("Invalid JSON returned by Ollama", [
      "LLM response was not valid JSON",
      `Snippet: ${jsonText.slice(0, 200)}`,
    ]);
  }
}

export function createOllamaInvoke(options: OllamaInvokeOptions) {
  const baseUrl = trimTrailingSlash(options.baseUrl);
  const model = options.model.trim();

  if (!baseUrl) {
    throw new ValidationError("LLM_BASE_URL is required for Ollama");
  }
  if (!model) {
    throw new ValidationError("LLM_MODEL is required for Ollama");
  }

  const fetchFn = options.fetchFn ?? fetch;

  return async (prompt: LlmInvokePrompt): Promise<unknown> => {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 30_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(`${baseUrl}/api/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          messages: buildPromptMessages(prompt),
        }),
      });

      const rawText = await response.text();
      if (!response.ok) {
        throw new ValidationError("Ollama request failed", [
          `HTTP ${response.status}`,
          rawText.slice(0, 300),
        ]);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawText);
      } catch {
        throw new ValidationError("Invalid Ollama HTTP response", ["Response was not valid JSON"]);
      }

      return parseOllamaPayload(payload);
    } finally {
      clearTimeout(timeout);
    }
  };
}
