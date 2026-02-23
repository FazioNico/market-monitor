import { createAppContext } from "../../runtime/app-context";
import { runSchedulerTick, startSchedulerLoop } from "../../runtime/scheduler";
import { runReviewCommand } from "./run-review";

type Logger = Pick<typeof console, "log" | "error">;

interface ParsedSchedulerArgs {
  time: string;
  once: boolean;
}

function parseSchedulerArgs(argv: string[]): ParsedSchedulerArgs {
  const parsed: ParsedSchedulerArgs = {
    time: "08:00",
    once: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--time") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("Missing value for --time");
      }
      parsed.time = value;
      i += 1;
      continue;
    }
    if (arg === "--once") {
      parsed.once = true;
      continue;
    }
    throw new Error(`Unexpected scheduler argument: ${arg}`);
  }

  return parsed;
}

export interface RunSchedulerCommandOptions {
  argv?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  logger?: Logger;
  now?: Date;
}

export async function runSchedulerCommand(options: RunSchedulerCommandOptions = {}): Promise<number> {
  const logger = options.logger ?? console;

  let parsed: ParsedSchedulerArgs;
  try {
    parsed = parseSchedulerArgs(options.argv ?? []);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  const context = createAppContext({
    cwd: options.cwd,
    env: options.env,
  });

  if (parsed.once) {
    const result = await runSchedulerTick({
      paths: context.paths,
      scheduleTime: parsed.time,
      now: options.now,
      runReview: async ({ triggerType, scheduleSlotKey }) =>
        runReviewCommand({
          triggerType,
          scheduleSlotKey,
          cwd: options.cwd,
          env: options.env,
          logger,
        }),
    });
    logger.log(`Scheduler tick result: ${result.status} (${result.slotKey})`);
    return result.status === "failed" ? 1 : 0;
  }

  startSchedulerLoop({
    onTick: async () => {
      await runSchedulerTick({
        paths: context.paths,
        scheduleTime: parsed.time,
        runReview: async ({ triggerType, scheduleSlotKey }) =>
          runReviewCommand({
            triggerType,
            scheduleSlotKey,
            cwd: options.cwd,
            env: options.env,
            logger,
          }),
      });
    },
  });

  logger.log(`Scheduler started for local time ${parsed.time}`);
  return 0;
}
