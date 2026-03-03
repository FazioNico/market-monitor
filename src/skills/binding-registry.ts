import type { SkillDefinition } from "../shared/types";
import { ValidationError } from "../shared/errors";
import { deterministicOutlookValidationBinding } from "./bindings/deterministic-outlook-validation";
import { deterministicReportFormatBinding } from "./bindings/deterministic-report-format";
import { llmPositionWordingBinding, type LlmPositionWordingBindingDependencies } from "./bindings/llm-position-wording";
import { llmSentimentBinding, type LlmSentimentBindingDependencies } from "./bindings/llm-sentiment";

export type SkillBindingHandler = (input: { skill: SkillDefinition; payload: unknown }) => Promise<unknown>;

export interface BindingRegistry {
  supportedBindingTypes: Set<string>;
  execute(skill: SkillDefinition, payload: unknown): Promise<unknown>;
}

export function createBindingRegistry(options: {
  llm?: LlmSentimentBindingDependencies & LlmPositionWordingBindingDependencies;
} = {}): BindingRegistry {
  const handlers = new Map<string, SkillBindingHandler>();

  handlers.set("deterministic_outlook_validation", async ({ payload }) =>
    deterministicOutlookValidationBinding(payload as any),
  );
  handlers.set("deterministic_report_format", async ({ payload }) =>
    deterministicReportFormatBinding(payload as any),
  );
  handlers.set("llm_sentiment", async ({ skill, payload }) =>
    llmSentimentBinding(
      {
        skillDescription: skill.description,
        ...(payload as any),
      },
      { invoke: options.llm?.invoke },
    ),
  );
  handlers.set("llm_position_wording", async ({ skill, payload }) =>
    llmPositionWordingBinding(
      {
        skillDescription: skill.description,
        ...(payload as any),
      },
      { invoke: options.llm?.invoke },
    ),
  );

  return {
    supportedBindingTypes: new Set(handlers.keys()),
    async execute(skill, payload) {
      const handler = handlers.get(skill.bindingType);
      if (!handler) {
        throw new ValidationError("Unknown skill binding type", [
          `${skill.id}: ${skill.bindingType}`,
        ]);
      }
      return handler({ skill, payload });
    },
  };
}
