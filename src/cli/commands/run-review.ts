import { createAppContext } from "../../runtime/app-context";
import { appendRunLogEntry, createStartedRunLogEntry } from "../../runtime/run-log";
import { acquireRunLock, buildRunLockPath } from "../../runtime/run-lock";
import { ValidationError } from "../../shared/errors";
import type {
  MacroSeriesObservation,
  MarketSnapshotItem,
  NewsItem,
  NormalizedNewsItem,
  TriggerType,
  WatchlistInstrument,
} from "../../shared/types";
import { createReportMetadata, createRunId } from "../../report/report-model";
import { renderMarketReportMarkdown } from "../../report/markdown-renderer";
import { writeMarketReportFile } from "../../report/report-writer";
import { readFeedCatalogFile } from "../../config/feed-catalog";
import { readWatchlistFile } from "../../config/watchlist";
import { deduplicateNews } from "../../ingest/deduplicate-news";
import { fetchRssFeeds } from "../../ingest/rss-fetch";
import { parseRssEntries } from "../../ingest/rss-parse";
import { createCoinGeckoClient } from "../../market/coingecko-client";
import { createFredClient } from "../../market/fred-client";
import { createProviderRegistry } from "../../market/provider-registry";
import { fetchMacroSeriesContext } from "../../market/macro-series-service";
import { buildMarketSnapshot } from "../../market/snapshot-service";
import { detectRegime } from "../../analysis/regime-detector";
import {
  generateSentimentAssessment,
  type SentimentServiceOptions,
} from "../../analysis/sentiment-service";
import { buildOutlookDistribution } from "../../analysis/outlook-service";
import { buildRiskInvalidation } from "../../analysis/risk-invalidation";
import {
  buildPositionWording,
  type PositionWordingServiceOptions,
} from "../../analysis/position-wording";
import { createBindingRegistry } from "../../skills/binding-registry";
import { loadSkillsFromDirectory } from "../../skills/skill-loader";

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

function dateFromOverride(dateOverride: string | undefined): Date | undefined {
  if (!dateOverride) {
    return undefined;
  }
  return new Date(`${dateOverride}T08:00:00`);
}

function flatten<T>(input: T[][]): T[] {
  return input.flatMap((items) => items);
}

export interface RunReviewCommandOptions {
  argv?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  logger?: Logger;
  fetchFn?: typeof fetch;
  triggerType?: TriggerType;
  scheduleSlotKey?: string;
  llmBindings?: {
    sentiment?: SentimentServiceOptions["llmBinding"];
    positionWording?: PositionWordingServiceOptions["llmBinding"];
  };
  llmInvoke?: (prompt: { skillDescription: string; context: unknown }) => Promise<unknown>;
}

export async function runReviewCommand(options: RunReviewCommandOptions = {}): Promise<number> {
  const logger = options.logger ?? console;
  const argv = options.argv ?? [];

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

  const runId = createRunId();

  try {
    const context = createAppContext({
      cwd: options.cwd,
      env: options.env,
    });

    const baseDate = dateFromOverride(parsedArgs.dateOverride) ?? context.clock.now();
    const generatedAt = baseDate.toISOString();
    const feedCatalog = await readFeedCatalogFile(context.paths.rssFeedsPath);
    const watchlist = await readWatchlistFile(context.paths.watchlistPath);
    const bindingRegistry = createBindingRegistry({ llm: { invoke: options.llmInvoke } });
    const loadedSkills = await loadSkillsFromDirectory({
      skillsRootDir: context.paths.skillsDir,
      allowedBindingTypes: bindingRegistry.supportedBindingTypes,
    });
    const enabledSkills = loadedSkills.filter((skill) => skill.enabled);
    const sentimentSkill = enabledSkills.find((skill) => skill.type === "sentiment");
    const outlookValidationSkill = enabledSkills.find(
      (skill) => skill.bindingType === "deterministic_outlook_validation",
    );
    const reportFormatSkill = enabledSkills.find(
      (skill) => skill.bindingType === "deterministic_report_format",
    );
    const positioningSkill = enabledSkills.find((skill) => skill.type === "positioning");

    if (parsedArgs.triggerType === "scheduled" && options.scheduleSlotKey) {
      const reviewSlotLockPath = buildRunLockPath(`${context.paths.logsDir}/review-slots`, options.scheduleSlotKey);
      const slotLock = await acquireRunLock({
        lockPath: reviewSlotLockPath,
        lockKey: options.scheduleSlotKey,
        runId,
        now: baseDate,
        ttlMs: 26 * 60 * 60 * 1000,
      });
      if (!slotLock.acquired) {
        await appendRunLogEntry(context.paths.runLogPath, {
          runId,
          triggerType: "scheduled",
          startedAt: generatedAt,
          endedAt: generatedAt,
          status: "skipped_duplicate",
          llmStatus: "not_used",
          messages: [`duplicate review run skipped for slot ${options.scheduleSlotKey}`],
        });
        return 0;
      }
    }

    await appendRunLogEntry(
      context.paths.runLogPath,
      createStartedRunLogEntry({
        runId,
        triggerType: parsedArgs.triggerType,
        startedAt: generatedAt,
        messages: ["review run started"],
      }),
    );

    const rssResponses = await fetchRssFeeds(feedCatalog.entries, {
      fetchFn: options.fetchFn,
      now: baseDate,
      lookbackHours: feedCatalog.effectiveLookbackHours,
    });

    const parsedNewsByFeed: NormalizedNewsItem[][] = rssResponses.map((response) =>
      parseRssEntries(response.xml, {
        source: response.feed.source,
        category: response.feed.category,
        ingestedAt: response.fetchedAt,
      }).filter((item) => {
        const published = new Date(item.publishedAt).getTime();
        const cutoff = baseDate.getTime() - feedCatalog.effectiveLookbackHours * 60 * 60 * 1000;
        return published >= cutoff;
      }),
    );
    const newsItems: NewsItem[] = deduplicateNews(flatten(parsedNewsByFeed));

    const providers = createProviderRegistry({
      coingecko: createCoinGeckoClient({
        fetchFn: options.fetchFn,
        apiKey: context.env.coingeckoApiKey,
      }),
      fred: createFredClient({
        fetchFn: options.fetchFn,
        apiKey: context.env.fredApiKey,
      }),
    });

    const marketSnapshot: MarketSnapshotItem[] = await buildMarketSnapshot(
      watchlist.instruments as WatchlistInstrument[],
      providers,
    );
    const macroContext: MacroSeriesObservation[] = await fetchMacroSeriesContext(providers);

    const regime = detectRegime({ marketSnapshot, macroContext });
    let reportStatus: "complete" | "incomplete" = "complete";
    const omissionReasons: string[] = [];

    const sentiment = await generateSentimentAssessment(
      { newsItems, marketSnapshot, regime },
      sentimentSkill
        ? {
            skillExecution: {
              skill: sentimentSkill,
              execute: (payload) => bindingRegistry.execute(sentimentSkill, payload),
            },
          }
        : { llmBinding: options.llmBindings?.sentiment },
    );
    if (sentiment.status !== "complete") {
      reportStatus = "incomplete";
      omissionReasons.push("LLM sentiment failure");
    }
    let outlook = buildOutlookDistribution({ regime, sentiment });
    if (outlookValidationSkill) {
      const validated = (await bindingRegistry.execute(outlookValidationSkill, { outlook })) as {
        valid: true;
        outlook: typeof outlook;
      };
      outlook = validated.outlook;
    }
    const riskInvalidation = buildRiskInvalidation({ regime, marketSnapshot, macroContext });
    const positionWording = await buildPositionWording(
      { regime, outlook },
      positioningSkill
        ? {
            skillExecution: {
              skill: positioningSkill,
              execute: (payload) => bindingRegistry.execute(positioningSkill, payload),
            },
          }
        : { llmBinding: options.llmBindings?.positionWording },
    );
    if (positionWording.status !== "complete") {
      reportStatus = "incomplete";
      omissionReasons.push("LLM position wording failure");
    }

    const metadata = createReportMetadata({
      runId,
      triggerType: parsedArgs.triggerType,
      generatedAt,
      status: reportStatus,
      dataSources: ["RSS", "CoinGecko", "FRED"],
      omissionReasons,
    });

    const markdown = renderMarketReportMarkdown({
      generatedAt: metadata.generatedAt,
      status: metadata.status,
      triggerType: metadata.triggerType,
      dataSources: metadata.dataSources,
      omissionReasons: metadata.omissionReasons,
      newsItems,
      marketSnapshot,
      macroContext,
      regime,
      sentiment,
      outlook,
      riskInvalidation,
      positionWording,
      diagnostics: [
        `Feeds processed: ${feedCatalog.entries.length}`,
        `Watchlist enabled: ${watchlist.instruments.length}`,
        `Skills enabled: ${enabledSkills.length}`,
      ],
    });
    if (reportFormatSkill) {
      const reportFormatCheck = (await bindingRegistry.execute(reportFormatSkill, { markdown })) as {
        valid: boolean;
        issues: string[];
      };
      if (!reportFormatCheck.valid) {
        throw new ValidationError("Report format skill validation failed", reportFormatCheck.issues);
      }
    }

    const reportResult = await writeMarketReportFile({
      reportsDir: context.paths.reportsDir,
      markdown,
      baseDate,
    });

    await appendRunLogEntry(context.paths.runLogPath, {
      runId,
      triggerType: parsedArgs.triggerType,
      startedAt: generatedAt,
      endedAt: new Date().toISOString(),
      status: reportStatus === "complete" ? "success" : "partial_success",
      reportStatus,
      reportFilePath: reportResult.filePath,
      llmStatus:
        reportStatus === "incomplete"
          ? "error"
          : options.llmBindings
            ? "success"
            : "not_used",
      messages: [
        "review run completed",
        `news_items=${newsItems.length}`,
        `market_snapshot=${marketSnapshot.length}`,
        `macro_context=${macroContext.length}`,
        ...(omissionReasons.length > 0 ? [`omissions=${omissionReasons.join("|")}`] : []),
      ],
    });

    logger.log(`Report written: ${reportResult.filePath}`);
    return 0;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    const code = error instanceof ValidationError || err?.code === "ENOENT" ? 2 : 1;
    logger.error(error instanceof Error ? error.message : String(error));

    try {
      const context = createAppContext({
        cwd: options.cwd,
        env: options.env,
      });
      await appendRunLogEntry(context.paths.runLogPath, {
        runId,
        triggerType: parsedArgs?.triggerType ?? "manual",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        status: "failed",
        llmStatus: "not_used",
        messages: [error instanceof Error ? error.message : String(error)],
      });
    } catch {
      // Avoid masking the original error path if logging cannot be initialized.
    }

    return code;
  }
}
