export interface LlmInvokePrompt {
  skillDescription: string;
  context: unknown;
}

export type LlmInvoke = (prompt: LlmInvokePrompt) => Promise<unknown>;
