import { runValidateConfigCommand } from "./commands/validate-config";
import { runReviewCommand } from "./commands/run-review";
import { runSchedulerCommand } from "./commands/run-scheduler";

type Logger = Pick<typeof console, "log" | "error">;

function printHelp(logger: Logger): void {
  logger.log("Usage:");
  logger.log("  market-review config validate");
  logger.log("  market-review review run");
  logger.log("  market-review scheduler start");
  logger.log("");
  logger.log("Root namespace is optional in development:");
  logger.log("  bun src/index.ts config validate");
}

function normalizeArgv(argv: string[]): string[] {
  const normalized = [...argv];
  if (normalized[0] === "market-review") {
    normalized.shift();
  }
  return normalized;
}

export async function main(argv = process.argv.slice(2), logger: Logger = console): Promise<number> {
  const args = normalizeArgv(argv);

  if (args.length === 0) {
    printHelp(logger);
    return 1;
  }

  if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    printHelp(logger);
    return 0;
  }

  const [group, action, ...rest] = args;

  if (group === "config" && action === "validate") {
    return runValidateConfigCommand({ argv: rest, logger });
  }

  if (group === "review" && action === "run") {
    return runReviewCommand({ argv: rest, logger });
  }

  if (group === "scheduler" && action === "start") {
    return runSchedulerCommand({ argv: rest, logger });
  }

  logger.error(`Unknown command: ${args.join(" ")}`);
  printHelp(logger);
  return 1;
}
