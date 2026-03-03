import { createAppContext } from "../../runtime/app-context";
import { readFeedCatalogFile } from "../../config/feed-catalog";
import { readWatchlistFile } from "../../config/watchlist";
import { ValidationError } from "../../shared/errors";
import { createBindingRegistry } from "../../skills/binding-registry";
import { loadSkillsFromDirectory } from "../../skills/skill-loader";

type Logger = Pick<typeof console, "log" | "error">;

export interface ValidateConfigCommandOptions {
  argv?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  logger?: Logger;
}

export async function runValidateConfigCommand(
  options: ValidateConfigCommandOptions = {},
): Promise<number> {
  const logger = options.logger ?? console;
  const argv = options.argv ?? [];

  if (argv.length > 0) {
    logger.error(`Unexpected arguments for config validate: ${argv.join(" ")}`);
    return 1;
  }

  try {
    const context = createAppContext({
      cwd: options.cwd,
      env: options.env,
    });
    const feedCatalog = await readFeedCatalogFile(context.paths.rssFeedsPath);
    const watchlist = await readWatchlistFile(context.paths.watchlistPath);
    const bindingRegistry = createBindingRegistry();
    const skills = await loadSkillsFromDirectory({
      skillsRootDir: context.paths.skillsDir,
      allowedBindingTypes: bindingRegistry.supportedBindingTypes,
    });

    logger.log("Configuration validation passed");
    logger.log(`REPORTS_DIR -> ${context.paths.reportsDir}`);
    logger.log(`RUN_LOG_PATH -> ${context.paths.runLogPath}`);
    logger.log(
      `RSS_FEEDS -> ${feedCatalog.entries.length} enabled / ${feedCatalog.allEntries.length} total (lookback=${feedCatalog.effectiveLookbackHours}h)`,
    );
    logger.log(
      `WATCHLIST -> ${watchlist.instruments.length} enabled / ${watchlist.allInstruments.length} total`,
    );
    logger.log(`SKILLS -> ${skills.filter((skill) => skill.enabled).length} enabled / ${skills.length} total`);
    return 0;
  } catch (error) {
    if (error instanceof ValidationError) {
      logger.error(error.message);
      for (const issue of error.issues) {
        logger.error(`- ${issue}`);
      }
      return 2;
    }

    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      logger.error(errno.message);
      return 2;
    }

    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
