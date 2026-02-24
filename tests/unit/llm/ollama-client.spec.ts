import { describe, expect, it } from "vitest";

import { ValidationError } from "../../../src/shared/errors";
import { createOllamaInvoke } from "../../../src/llm/ollama-client";

describe("ollama client", () => {
  it("calls /api/chat and parses JSON from message.content", async () => {
    const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];

    const invoke = createOllamaInvoke({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      fetchFn: (async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        calls.push({
          url: String(input),
          body: JSON.parse(String(init?.body ?? "{}")),
          headers: (init?.headers ?? {}) as Record<string, string>,
        });
        return new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                score: 1,
                narrativeSummary: "Measured summary",
                priceActionCoherence: "Measured coherence",
              }),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch,
    });

    const result = await invoke({
      skillDescription: "test sentiment skill",
      context: { x: 1 },
    });

    expect((result as any).score).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:11434/api/chat");
    expect(calls[0]?.body.model).toBe("llama3.1");
    expect(calls[0]?.body.stream).toBe(false);
    expect(calls[0]?.body.format).toBe("json");
    expect(Array.isArray(calls[0]?.body.messages)).toBe(true);
  });

  it("throws a validation error on non-OK responses", async () => {
    const invoke = createOllamaInvoke({
      baseUrl: "http://localhost:11434",
      model: "llama3.1",
      fetchFn: (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch,
    });

    await expect(
      invoke({
        skillDescription: "test",
        context: {},
      }),
    ).rejects.toThrowError(ValidationError);
  });
});
