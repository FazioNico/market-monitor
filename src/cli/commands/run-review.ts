import { ValidationError } from "../../shared/errors";
import type { TriggerType } from "../../shared/types";
import { createAppContext } from "../../runtime/app-context";
import {
  appendRunEventEnvelope,
  buildRunEventLogPath,
  createRunEventEnvelope,
} from "../../runtime/run-event-log";
import type {
  RunReviewServiceOptions,
} from "../../runtime/run-review-service";
import {
  RunReviewServiceExecutionError,
  runReviewService,
} from "../../runtime/run-review-service";
import type { RunReviewServiceEvent } from "../../runtime/run-review-events";
import { createCliProgressIndicator } from "../progress-indicator";

type Logger = Pick<typeof console, "log" | "error">;

interface ParsedRunReviewArgs {
  triggerType: TriggerType;
  dateOverride?: string;
}

function parseRunReviewArgs(argv: string[]): ParsedRunReviewArgs {
  const parsed: ParsedRunReviewArgs = {
    triggerType: "manual",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--trigger") {
      const value = argv[index + 1];
      if (value !== "manual" && value !== "scheduled") {
        throw new ValidationError("Invalid --trigger value", ["Expected manual or scheduled"]);
      }
      parsed.triggerType = value;
      index += 1;
      continue;
    }
    if (arg === "--date") {
      const value = argv[index + 1];
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new ValidationError("Invalid --date value", ["Expected YYYY-MM-DD"]);
      }
      parsed.dateOverride = value;
      index += 1;
      continue;
    }
    throw new ValidationError("Unknown review run argument", [`Unexpected argument: ${arg}`]);
  }

  return parsed;
}

export interface RunReviewCommandOptions {
  argv?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  logger?: Logger;
  fetchFn?: typeof fetch;
  triggerType?: TriggerType;
  scheduleSlotKey?: string;
  llmBindings?: RunReviewServiceOptions["llmBindings"];
  llmInvoke?: RunReviewServiceOptions["llmInvoke"];
}

function handleCliEvent(
  event: RunReviewServiceEvent,
  progress: ReturnType<typeof createCliProgressIndicator>,
  logger: Logger,
  state: { lastErrorEventMessage?: string },
): void {
  if (event.type === "stage.started") {
    progress.setLabel(event.label);
    return;
  }

  if (event.type === "log.message") {
    if (event.level === "error") {
      state.lastErrorEventMessage = event.message;
      progress.error(event.message);
      return;
    }
    if (event.level === "warn") {
      progress.error(event.message);
      return;
    }
    return;
  }

  if (event.type === "run.skipped_duplicate") {
    logger.log(event.message);
  }
}

export async function runReviewCommand(options: RunReviewCommandOptions = {}): Promise<number> {
  const logger = options.logger ?? console;
  const argv = options.argv ?? [];
  const appContext = createAppContext({
    cwd: options.cwd,
    env: options.env,
  });
  const runEventLogStateByRunId = new Map<
    string,
    { eventLogPath: string; nextEventId: number }
  >();

  let parsedArgs: ParsedRunReviewArgs;
  try {
    parsedArgs = parseRunReviewArgs(argv);
    if (options.triggerType) {
      parsedArgs.triggerType = options.triggerType;
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error(error.message);
      for (const issue of error.issues) {
        logger.error(`- ${issue}`);
      }
      return 2;
    }
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const progress = createCliProgressIndicator({
    logger,
    label: "Generating market review",
  });
  const eventState: { lastErrorEventMessage?: string } = {};

  try {
    progress.start();

    const result = await runReviewService({
      cwd: options.cwd,
      env: options.env,
      fetchFn: options.fetchFn,
      triggerType: parsedArgs.triggerType,
      dateOverride: parsedArgs.dateOverride,
      scheduleSlotKey: options.scheduleSlotKey,
      llmBindings: options.llmBindings,
      llmInvoke: options.llmInvoke,
      onEvent: async (event) => {
        handleCliEvent(event, progress, logger, eventState);

        const existingState = runEventLogStateByRunId.get(event.runId);
        const runState =
          existingState ??
          (() => {
            const created = {
              eventLogPath: buildRunEventLogPath(
                appContext.paths.logsDir,
                event.runId,
              ),
              nextEventId: 1,
            };
            runEventLogStateByRunId.set(event.runId, created);
            return created;
          })();

        await appendRunEventEnvelope(
          runState.eventLogPath,
          createRunEventEnvelope({
            id: runState.nextEventId,
            runId: event.runId,
            event,
          }),
        );
        runState.nextEventId += 1;
      },
    });

    if (result.status === "completed") {
      const elapsed = progress.elapsedLabel();
      progress.stop();
      logger.log(`Report written: ${result.reportFilePath} (elapsed ${elapsed})`);
      return 0;
    }

    progress.stop();
    return 0;
  } catch (error) {
    progress.stop();
    if (error instanceof RunReviewServiceExecutionError) {
      if (eventState.lastErrorEventMessage !== error.message) {
        logger.error(error.message);
      }
      return error.exitCode;
    }
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    progress.stop();
  }
}
