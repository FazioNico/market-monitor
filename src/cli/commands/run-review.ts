import { createAppContext } from "../../runtime/app-context";
import { appendRunLogEntry, createStartedRunLogEntry } from "../../runtime/run-log";
import { acquireRunLock, buildRunLockPath } from "../../runtime/run-lock";
import { ValidationError } from "../../shared/errors";
import type {
  EtfFlowSnapshot,
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
import { createFarsideEtfClient } from "../../market/farside-etf-client";
import { createFredClient } from "../../market/fred-client";
import { createProviderRegistry } from "../../market/provider-registry";
import { fetchMacroSeriesContext } from "../../market/macro-series-service";
import { buildMarketSnapshot } from "../../market/snapshot-service";
import { detectRegime } from "../../analysis/regime-detector";
import {
  generateSentimentAssessment,
  type SentimentServiceOptions,
} from "../../analysis/sentiment-service";
import { buildNewsReadingPriorityList } from "../../analysis/news-reading-priority";
import { enrichTopArticlesWithContentSummaries } from "../../analysis/top-article-content-summary";
import { buildOutlookDistribution } from "../../analysis/outlook-service";
import { buildRiskInvalidation } from "../../analysis/risk-invalidation";
import {
  buildPositionWording,
  type PositionWordingServiceOptions,
} from "../../analysis/position-wording";
import { createBindingRegistry } from "../../skills/binding-registry";
import { loadSkillsFromDirectory } from "../../skills/skill-loader";
import { createOllamaInvoke } from "../../llm/ollama-client";

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

function describeLlmError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name ? `${error.name}: ` : ""}${error.message}`.trim().slice(0, 800);
  }
  return String(error).slice(0, 800);
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
    const llmInvoke =
      options.llmInvoke ??
      (context.env.llmBaseUrl && context.env.llmModel
        ? createOllamaInvoke({
            baseUrl: context.env.llmBaseUrl,
            model: context.env.llmModel,
            apiKey: context.env.llmApiKey,
            fetchFn: options.fetchFn,
          })
        : undefined);

    const bindingRegistry = createBindingRegistry({ llm: { invoke: llmInvoke } });
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

    const farsideEtfClient = createFarsideEtfClient({
      fetchFn: options.fetchFn,
    });

    let etfFlowsError: string | undefined;
    const [marketSnapshot, macroContext, etfFlowsResult] = await Promise.all([
      buildMarketSnapshot(watchlist.instruments as WatchlistInstrument[], providers),
      fetchMacroSeriesContext(providers),
      farsideEtfClient
        .fetchEtfFlowSnapshot()
        .then((value) => ({ ok: true as const, value }))
        .catch((error) => ({ ok: false as const, error })),
    ]);
    const etfFlows: EtfFlowSnapshot | undefined = etfFlowsResult.ok ? etfFlowsResult.value : undefined;
    if (!etfFlowsResult.ok) {
      etfFlowsError = describeLlmError(etfFlowsResult.error);
      logger.error(`ETF flow scraping failure (Farside): ${etfFlowsError}`);
    }

    const regime = detectRegime({ marketSnapshot, macroContext });
    let reportStatus: "complete" | "incomplete" = "complete";
    const omissionReasons: string[] = [];
    let sentimentLlmError: string | undefined;
    let topArticlesLlmError: string | undefined;
    let positionLlmError: string | undefined;

    const sentiment = await generateSentimentAssessment(
      { newsItems, marketSnapshot, regime },
      sentimentSkill
        ? {
            skillExecution: {
              skill: sentimentSkill,
              execute: (payload) => bindingRegistry.execute(sentimentSkill, payload),
            },
            onLlmError: (error) => {
              sentimentLlmError = describeLlmError(error);
            },
          }
        : {
            llmBinding: options.llmBindings?.sentiment,
            onLlmError: (error) => {
              sentimentLlmError = describeLlmError(error);
            },
          },
    );
    if (sentiment.status !== "complete") {
      reportStatus = "incomplete";
      const reason = sentimentLlmError
        ? `LLM sentiment failure: ${sentimentLlmError}`
        : "LLM sentiment failure";
      omissionReasons.push(reason);
      logger.error(reason);
    }
    const topArticlesToRead = await buildNewsReadingPriorityList(
      { newsItems, marketSnapshot, regime, sentiment },
      {
        llmInvoke,
        now: baseDate,
        // Large news universes (700+) can exceed LLM latency budgets if the candidate pool is too wide.
        // Keep a strong prefilter while limiting total token load for the ranking pass.
        prefilterLimit: 120,
        chunkSize: 80,
        onLlmError: (error) => {
          topArticlesLlmError = describeLlmError(error);
        },
      },
    );
    if (topArticlesLlmError) {
      logger.error(`LLM top article ranking failure: ${topArticlesLlmError}`);
    }
    let topArticlesSummaryEnrichmentError: string | undefined;
    let topArticlesSummaryLlmError: string | undefined;
    let topArticleSummaryStats = {
      total: topArticlesToRead.items.length,
      fromArticleContent: 0,
      fromRssFallback: 0,
      unavailable: topArticlesToRead.items.length,
      fetchErrors: 0,
      llmSummaries: 0,
      llmErrors: 0,
    };
    let enrichedTopArticlesToRead = topArticlesToRead;
    try {
      const summaryEnrichment = await enrichTopArticlesWithContentSummaries(
        { topArticlesToRead, newsItems },
        {
          fetchFn: options.fetchFn,
          llmInvoke,
          onLlmError: (error) => {
            topArticlesSummaryLlmError ??= describeLlmError(error);
          },
        },
      );
      enrichedTopArticlesToRead = summaryEnrichment.topArticlesToRead;
      topArticleSummaryStats = summaryEnrichment.stats;
    } catch (error) {
      topArticlesSummaryEnrichmentError = describeLlmError(error);
      logger.error(`Top article summary enrichment failure: ${topArticlesSummaryEnrichmentError}`);
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
            onLlmError: (error) => {
              positionLlmError = describeLlmError(error);
            },
          }
        : {
            llmBinding: options.llmBindings?.positionWording,
            onLlmError: (error) => {
              positionLlmError = describeLlmError(error);
            },
          },
    );
    if (positionWording.status !== "complete") {
      reportStatus = "incomplete";
      const reason = positionLlmError
        ? `LLM position wording failure: ${positionLlmError}`
        : "LLM position wording failure";
      omissionReasons.push(reason);
      logger.error(reason);
    }

    const metadata = createReportMetadata({
      runId,
      triggerType: parsedArgs.triggerType,
      generatedAt,
      status: reportStatus,
      dataSources: ["RSS", "CoinGecko", "FRED", ...(etfFlows ? ["Farside"] : [])],
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
      topArticlesToRead: enrichedTopArticlesToRead,
      outlook,
      riskInvalidation,
      positionWording,
      etfFlows,
      diagnostics: [
        `Feeds processed: ${feedCatalog.entries.length}`,
        `Watchlist enabled: ${watchlist.instruments.length}`,
        `ETF flow datasets: ${etfFlows?.datasets.length ?? 0}`,
        ...(etfFlows
          ? etfFlows.datasets.map(
              (dataset) => `ETF ${dataset.asset.toUpperCase()} rows=${dataset.rows.length} tickers=${dataset.etfTickers.length}`,
            )
          : []),
        `Skills enabled: ${enabledSkills.length}`,
        `Top article picks method: ${enrichedTopArticlesToRead.method}`,
        `Top article picks selected: ${enrichedTopArticlesToRead.items.length}`,
        `Top article candidate pool: ${enrichedTopArticlesToRead.candidateNewsEvaluated}/${enrichedTopArticlesToRead.totalNewsEvaluated}`,
        `Top article content summaries: article=${topArticleSummaryStats.fromArticleContent}, llm=${topArticleSummaryStats.llmSummaries}, rss_fallback=${topArticleSummaryStats.fromRssFallback}, unavailable=${topArticleSummaryStats.unavailable}, fetch_errors=${topArticleSummaryStats.fetchErrors}, llm_errors=${topArticleSummaryStats.llmErrors}`,
        ...(topArticlesLlmError ? [`Top article ranking LLM error: ${topArticlesLlmError}`] : []),
        ...(topArticlesSummaryLlmError ? [`Top article summary LLM error: ${topArticlesSummaryLlmError}`] : []),
        ...(topArticlesSummaryEnrichmentError
          ? [`Top article summary enrichment error: ${topArticlesSummaryEnrichmentError}`]
          : []),
        ...(etfFlowsError ? [`ETF flow scraping error (Farside): ${etfFlowsError}`] : []),
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
          : llmInvoke
            ? "success"
            : "not_used",
      messages: [
        "review run completed",
        `news_items=${newsItems.length}`,
        `market_snapshot=${marketSnapshot.length}`,
        `macro_context=${macroContext.length}`,
        `etf_flow_datasets=${etfFlows?.datasets.length ?? 0}`,
        ...(omissionReasons.length > 0 ? [`omissions=${omissionReasons.join("|")}`] : []),
        ...(sentimentLlmError ? [`llm_sentiment_error=${sentimentLlmError}`] : []),
        ...(topArticlesLlmError ? [`llm_top_articles_error=${topArticlesLlmError}`] : []),
        ...(positionLlmError ? [`llm_position_error=${positionLlmError}`] : []),
        ...(etfFlowsError ? [`etf_flow_scrape_error=${etfFlowsError}`] : []),
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
