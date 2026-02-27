import { createAppContext } from "./app-context";
import { appendRunLogEntry, createStartedRunLogEntry } from "./run-log";
import { acquireRunLock, buildRunLockPath } from "./run-lock";
import type {
  RunReviewServiceEvent,
  RunReviewSectionKey,
  RunReviewStageKey,
} from "./run-review-events";
import { ValidationError } from "../shared/errors";
import type {
  AppEnv,
  EtfFlowSnapshot,
  MacroSeriesObservation,
  MarketSnapshotItem,
  NewsItem,
  NormalizedNewsItem,
  TriggerType,
  WatchlistInstrument,
} from "../shared/types";
import { createReportMetadata, createRunId } from "../report/report-model";
import { renderMarketReportMarkdown } from "../report/markdown-renderer";
import { writeMarketReportFile } from "../report/report-writer";
import { readFeedCatalogFile } from "../config/feed-catalog";
import { readWatchlistFile } from "../config/watchlist";
import { createAlphaVantageClient } from "../market/alphavantage-client";
import { deduplicateNews } from "../ingest/deduplicate-news";
import { fetchRssFeeds } from "../ingest/rss-fetch";
import { parseRssEntries } from "../ingest/rss-parse";
import { createCoinGeckoClient } from "../market/coingecko-client";
import { createFarsideEtfClient } from "../market/farside-etf-client";
import { createFredClient } from "../market/fred-client";
import { createHyperliquidClient } from "../market/hyperliquid-client";
import { createProviderRegistry } from "../market/provider-registry";
import { fetchMacroSeriesContext } from "../market/macro-series-service";
import { buildMarketSnapshot } from "../market/snapshot-service";
import { detectRegime } from "../analysis/regime-detector";
import {
  generateSentimentAssessment,
  type SentimentServiceOptions,
} from "../analysis/sentiment-service";
import { buildNewsReadingPriorityList } from "../analysis/news-reading-priority";
import { enrichTopArticlesWithContentSummaries } from "../analysis/top-article-content-summary";
import { buildOutlookDistribution } from "../analysis/outlook-service";
import { buildRiskInvalidation } from "../analysis/risk-invalidation";
import {
  buildPositionWording,
  type PositionWordingServiceOptions,
} from "../analysis/position-wording";
import { createBindingRegistry } from "../skills/binding-registry";
import { loadSkillsFromDirectory } from "../skills/skill-loader";
import { createGeminiInvoke } from "../llm/gemini-client";
import { createOllamaInvoke } from "../llm/ollama-client";
import type { LlmInvoke } from "../llm/types";

export interface RunReviewServiceOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
  triggerType?: TriggerType;
  dateOverride?: string;
  scheduleSlotKey?: string;
  runId?: string;
  llmBindings?: {
    sentiment?: SentimentServiceOptions["llmBinding"];
    positionWording?: PositionWordingServiceOptions["llmBinding"];
  };
  llmInvoke?: (prompt: { skillDescription: string; context: unknown }) => Promise<unknown>;
  onEvent?: (event: RunReviewServiceEvent) => void | Promise<void>;
}

export type RunReviewServiceResult =
  | {
      status: "skipped_duplicate";
      runId: string;
      triggerType: TriggerType;
      generatedAt: string;
      elapsedMs: number;
    }
  | {
      status: "completed";
      runId: string;
      triggerType: TriggerType;
      generatedAt: string;
      reportStatus: "complete" | "incomplete";
      reportFilePath: string;
      reportFileName: string;
      markdown: string;
      elapsedMs: number;
    };

export class RunReviewServiceExecutionError extends Error {
  constructor(
    message: string,
    public readonly exitCode: 1 | 2,
    public readonly causeValue?: unknown,
  ) {
    super(message);
    this.name = "RunReviewServiceExecutionError";
  }
}

function createConfiguredLlmInvoke(env: AppEnv, fetchFn?: typeof fetch): LlmInvoke | undefined {
  const provider = env.llmProvider ?? "ollama";

  if (provider === "gemini") {
    if (!env.llmModel || !env.llmApiKey) {
      return undefined;
    }
    return createGeminiInvoke({
      model: env.llmModel,
      apiKey: env.llmApiKey,
      baseUrl: env.llmBaseUrl,
      fetchFn,
    });
  }

  if (!env.llmBaseUrl || !env.llmModel) {
    return undefined;
  }

  return createOllamaInvoke({
    baseUrl: env.llmBaseUrl,
    model: env.llmModel,
    apiKey: env.llmApiKey,
    fetchFn,
  });
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
  if (error instanceof ValidationError) {
    const details = error.issues.length > 0 ? ` [${error.issues.join(" | ")}]` : "";
    return `${error.name ? `${error.name}: ` : ""}${error.message}${details}`.trim().slice(0, 800);
  }
  if (error instanceof Error) {
    return `${error.name ? `${error.name}: ` : ""}${error.message}`.trim().slice(0, 800);
  }
  return String(error).slice(0, 800);
}

function toErrorCode(error: unknown): 1 | 2 {
  const err = error as NodeJS.ErrnoException;
  return error instanceof ValidationError || err?.code === "ENOENT" ? 2 : 1;
}

function summarizeNewsForUi(newsItems: NewsItem[]): {
  total: number;
  preview: Array<Pick<NewsItem, "title" | "source" | "publishedAt" | "link" | "category">>;
} {
  return {
    total: newsItems.length,
    preview: newsItems.slice(0, 60).map((item) => ({
      title: item.title,
      source: item.source,
      publishedAt: item.publishedAt,
      link: item.link,
      category: item.category,
    })),
  };
}

function stageLabel(stage: RunReviewStageKey): string {
  switch (stage) {
    case "load_config":
      return "Loading config and skills";
    case "scheduled_lock":
      return "Checking scheduled run lock";
    case "init_run_log":
      return "Initializing run log";
    case "fetch_rss":
      return "Fetching RSS feeds";
    case "fetch_market_macro":
      return "Fetching market and macro data";
    case "detect_regime":
      return "Detecting market regime";
    case "analyze_sentiment":
      return "Analyzing sentiment";
    case "rank_top_articles":
      return "Ranking top articles";
    case "summarize_top_articles":
      return "Summarizing top articles";
    case "build_outlook":
      return "Building outlook distribution";
    case "build_risk_invalidation":
      return "Building risk invalidation";
    case "generate_positioning":
      return "Generating positioning guidance";
    case "render_report":
      return "Rendering report";
    case "validate_report_format":
      return "Validating report format";
    case "write_report":
      return "Writing report file";
    case "finalize_run_log":
      return "Finalizing run log";
  }
}

export async function runReviewService(
  options: RunReviewServiceOptions = {},
): Promise<RunReviewServiceResult> {
  const triggerType = options.triggerType ?? "manual";
  const runId = options.runId ?? createRunId();
  const startedAtMs = Date.now();
  let generatedAtForFailure = new Date().toISOString();

  async function emit(
    event: { type: RunReviewServiceEvent["type"] } & Record<string, unknown>,
  ): Promise<void> {
    if (!options.onEvent) {
      return;
    }
    await options.onEvent({
      ...event,
      runId,
      at: new Date().toISOString(),
    } as RunReviewServiceEvent);
  }

  async function emitStageStarted(stage: RunReviewStageKey): Promise<void> {
    await emit({
      type: "stage.started",
      stage,
      label: stageLabel(stage),
    });
  }

  async function emitStageCompleted(
    stage: RunReviewStageKey,
    metrics?: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await emit({
      type: "stage.completed",
      stage,
      ...(metrics ? { metrics } : {}),
    });
  }

  async function emitLog(level: "info" | "warn" | "error", message: string): Promise<void> {
    await emit({
      type: "log.message",
      level,
      message,
    });
  }

  async function emitSection(section: RunReviewSectionKey, payload: unknown): Promise<void> {
    await emit({
      type: "section.updated",
      section,
      payload,
    });
  }

  try {
    await emitLog("info", "review run queued");

    const context = createAppContext({
      cwd: options.cwd,
      env: options.env,
    });

    const baseDate = dateFromOverride(options.dateOverride) ?? context.clock.now();
    const generatedAt = baseDate.toISOString();
    generatedAtForFailure = generatedAt;

    await emit({
      type: "run.started",
      triggerType,
      generatedAt,
    });

    await emitStageStarted("load_config");
    const feedCatalog = await readFeedCatalogFile(context.paths.rssFeedsPath);
    const watchlist = await readWatchlistFile(context.paths.watchlistPath);
    const llmInvoke = options.llmInvoke ?? createConfiguredLlmInvoke(context.env, options.fetchFn);

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

    await emitSection("config", {
      feeds: {
        total: feedCatalog.entries.length,
        lookbackHours: feedCatalog.effectiveLookbackHours,
      },
      watchlist: {
        total: watchlist.instruments.length,
      },
      skills: {
        loaded: loadedSkills.length,
        enabled: enabledSkills.length,
        enabledNames: enabledSkills.map((skill) => skill.name),
      },
      llm: {
        enabled: Boolean(llmInvoke),
        provider: context.env.llmProvider ?? "ollama",
        model: context.env.llmModel ?? null,
      },
    });
    await emitStageCompleted("load_config", {
      feeds: feedCatalog.entries.length,
      watchlist: watchlist.instruments.length,
      enabledSkills: enabledSkills.length,
      llmEnabled: Boolean(llmInvoke),
    });

    if (triggerType === "scheduled" && options.scheduleSlotKey) {
      await emitStageStarted("scheduled_lock");
      const reviewSlotLockPath = buildRunLockPath(`${context.paths.logsDir}/review-slots`, options.scheduleSlotKey);
      const slotLock = await acquireRunLock({
        lockPath: reviewSlotLockPath,
        lockKey: options.scheduleSlotKey,
        runId,
        now: baseDate,
        ttlMs: 26 * 60 * 60 * 1000,
      });
      if (!slotLock.acquired) {
        const message = `duplicate review run skipped for slot ${options.scheduleSlotKey}`;
        await appendRunLogEntry(context.paths.runLogPath, {
          runId,
          triggerType: "scheduled",
          startedAt: generatedAt,
          endedAt: generatedAt,
          status: "skipped_duplicate",
          llmStatus: "not_used",
          messages: [message],
        });
        await emitLog("warn", message);
        await emit({
          type: "run.skipped_duplicate",
          scheduleSlotKey: options.scheduleSlotKey,
          message,
        });
        await emitStageCompleted("scheduled_lock", { acquired: false });
        return {
          status: "skipped_duplicate",
          runId,
          triggerType,
          generatedAt,
          elapsedMs: Date.now() - startedAtMs,
        };
      }
      await emitStageCompleted("scheduled_lock", { acquired: true });
    }

    await emitStageStarted("init_run_log");
    await appendRunLogEntry(
      context.paths.runLogPath,
      createStartedRunLogEntry({
        runId,
        triggerType,
        startedAt: generatedAt,
        messages: ["review run started"],
      }),
    );
    await emitStageCompleted("init_run_log");

    await emitStageStarted("fetch_rss");
    const rssResponses = await fetchRssFeeds(feedCatalog.entries, {
      fetchFn: options.fetchFn,
      now: baseDate,
      lookbackHours: feedCatalog.effectiveLookbackHours,
    });

    const rssParseErrors: Array<{
      source: string;
      category: string;
      message: string;
    }> = [];
    const parsedNewsByFeed: NormalizedNewsItem[][] = rssResponses.map((response) => {
      try {
        return parseRssEntries(response.xml, {
          source: response.feed.source,
          category: response.feed.category,
          ingestedAt: response.fetchedAt,
        }).filter((item) => {
          const published = new Date(item.publishedAt).getTime();
          const cutoff = baseDate.getTime() - feedCatalog.effectiveLookbackHours * 60 * 60 * 1000;
          return published >= cutoff;
        });
      } catch (error) {
        const message = describeLlmError(error);
        rssParseErrors.push({
          source: response.feed.source,
          category: response.feed.category,
          message,
        });
        return [];
      }
    });
    const newsItems: NewsItem[] = deduplicateNews(flatten(parsedNewsByFeed));
    for (const rssParseError of rssParseErrors) {
      await emitLog(
        "warn",
        `RSS parse skipped for ${rssParseError.source}/${rssParseError.category}: ${rssParseError.message}`,
      );
    }
    await emitSection("news", {
      ...summarizeNewsForUi(newsItems),
      byFeed: rssResponses.map((response, index) => ({
        source: response.feed.source,
        category: response.feed.category,
        fetchedAt: response.fetchedAt,
        parsedItems: parsedNewsByFeed[index]?.length ?? 0,
      })),
      parseErrors: rssParseErrors,
    });
    await emitStageCompleted("fetch_rss", {
      feedsFetched: rssResponses.length,
      feedsSkipped: rssParseErrors.length,
      newsItems: newsItems.length,
    });

    const providers = createProviderRegistry({
      alphavantage: createAlphaVantageClient({
        fetchFn: options.fetchFn,
        apiKey: context.env.alphaVantageApiKey,
      }),
      coingecko: createCoinGeckoClient({
        fetchFn: options.fetchFn,
        apiKey: context.env.coingeckoApiKey,
      }),
      fred: createFredClient({
        fetchFn: options.fetchFn,
        apiKey: context.env.fredApiKey,
      }),
      hyperliquid: createHyperliquidClient({
        dex: context.env.hyperliquidDex ?? "xyz",
      }),
    });

    const farsideEtfClient = createFarsideEtfClient({
      fetchFn: options.fetchFn,
    });

    let etfFlowsError: string | undefined;
    await emitStageStarted("fetch_market_macro");
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
      await emitLog("error", `ETF flow scraping failure (Farside): ${etfFlowsError}`);
    }
    await emitSection("marketSnapshot", marketSnapshot);
    await emitSection("macroContext", macroContext);
    await emitSection("etfFlows", {
      available: Boolean(etfFlows),
      error: etfFlowsError ?? null,
      snapshot: etfFlows ?? null,
    });
    await emitStageCompleted("fetch_market_macro", {
      marketSnapshot: marketSnapshot.length,
      macroContext: macroContext.length,
      etfDatasets: etfFlows?.datasets.length ?? 0,
    });

    await emitStageStarted("detect_regime");
    const regime = detectRegime({ marketSnapshot, macroContext });
    await emitSection("regime", regime);
    await emitStageCompleted("detect_regime", { label: regime.label });

    const marketProviders = new Set(marketSnapshot.map((item) => item.provider.toLowerCase()));
    let reportStatus: "complete" | "incomplete" = "complete";
    const omissionReasons: string[] = [];
    let sentimentLlmError: string | undefined;
    let topArticlesLlmError: string | undefined;
    let positionLlmError: string | undefined;

    await emitStageStarted("analyze_sentiment");
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
      await emitLog("error", reason);
    }
    await emitSection("sentiment", sentiment);
    await emitStageCompleted("analyze_sentiment", {
      status: sentiment.status,
      method: sentiment.method,
    });

    await emitStageStarted("rank_top_articles");
    const topArticlesToRead = await buildNewsReadingPriorityList(
      { newsItems, marketSnapshot, regime, sentiment },
      {
        llmInvoke,
        now: baseDate,
        prefilterLimit: 120,
        chunkSize: 80,
        onLlmError: (error) => {
          topArticlesLlmError = describeLlmError(error);
        },
      },
    );
    if (topArticlesLlmError) {
      await emitLog("error", `LLM top article ranking failure: ${topArticlesLlmError}`);
    }
    await emitSection("topArticles", topArticlesToRead);
    await emitStageCompleted("rank_top_articles", {
      selected: topArticlesToRead.items.length,
      candidates: topArticlesToRead.candidateNewsEvaluated,
      totalNews: topArticlesToRead.totalNewsEvaluated,
      method: topArticlesToRead.method,
    });

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
      await emitStageStarted("summarize_top_articles");
      const summaryEnrichment = await enrichTopArticlesWithContentSummaries(
        { topArticlesToRead, newsItems },
        {
          fetchFn: options.fetchFn,
          llmInvoke,
          concurrency: context.env.llmProvider === "gemini" ? 1 : undefined,
          onLlmError: (error) => {
            topArticlesSummaryLlmError ??= describeLlmError(error);
          },
          onItemProcessed: async (event) => {
            await emit({
              type: "top_articles.item_processed",
              completed: event.completed,
              total: event.total,
              item: event.item,
              stats: {
                total: event.stats.total,
                fromArticleContent: event.stats.fromArticleContent,
                fromRssFallback: event.stats.fromRssFallback,
                unavailable: event.stats.unavailable,
                fetchErrors: event.stats.fetchErrors,
                llmSummaries: event.stats.llmSummaries,
                llmErrors: event.stats.llmErrors,
              },
            });
          },
        },
      );
      enrichedTopArticlesToRead = summaryEnrichment.topArticlesToRead;
      topArticleSummaryStats = summaryEnrichment.stats;
      await emitSection("topArticles", enrichedTopArticlesToRead);
      await emitStageCompleted("summarize_top_articles", {
        total: topArticleSummaryStats.total,
        fromArticleContent: topArticleSummaryStats.fromArticleContent,
        fromRssFallback: topArticleSummaryStats.fromRssFallback,
        unavailable: topArticleSummaryStats.unavailable,
        fetchErrors: topArticleSummaryStats.fetchErrors,
        llmSummaries: topArticleSummaryStats.llmSummaries,
        llmErrors: topArticleSummaryStats.llmErrors,
      });
    } catch (error) {
      topArticlesSummaryEnrichmentError = describeLlmError(error);
      await emitLog("error", `Top article summary enrichment failure: ${topArticlesSummaryEnrichmentError}`);
      await emitStageCompleted("summarize_top_articles", {
        failed: true,
      });
    }

    await emitStageStarted("build_outlook");
    let outlook = buildOutlookDistribution({ regime, sentiment });
    if (outlookValidationSkill) {
      const validated = (await bindingRegistry.execute(outlookValidationSkill, { outlook })) as {
        valid: true;
        outlook: typeof outlook;
      };
      outlook = validated.outlook;
    }
    await emitSection("outlook", outlook);
    await emitStageCompleted("build_outlook", {
      primaryScenario: outlook.primaryScenario,
      validated: outlook.constraintValidated,
    });

    await emitStageStarted("build_risk_invalidation");
    const riskInvalidation = buildRiskInvalidation({ regime, marketSnapshot, macroContext });
    await emitSection("riskInvalidation", riskInvalidation);
    await emitStageCompleted("build_risk_invalidation", {
      invalidationConditions: riskInvalidation.invalidationConditions.length,
      keyPriceThresholds: riskInvalidation.keyPriceThresholds.length,
      criticalMacroEvents: riskInvalidation.criticalMacroEvents.length,
    });

    await emitStageStarted("generate_positioning");
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
      await emitLog("error", reason);
    }
    await emitSection("positionWording", positionWording);
    await emitStageCompleted("generate_positioning", {
      status: positionWording.status,
    });

    const metadata = createReportMetadata({
      runId,
      triggerType,
      generatedAt,
      status: reportStatus,
      dataSources: [
        "RSS",
        ...(marketProviders.has("alphavantage") ? ["Alpha Vantage"] : []),
        "CoinGecko",
        ...(marketProviders.has("hyperliquid") ? ["Hyperliquid"] : []),
        "FRED",
        ...(etfFlows ? ["Farside"] : []),
      ],
      omissionReasons,
    });

    const diagnostics = [
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
    ];
    await emitSection("diagnostics", diagnostics);

    await emitStageStarted("render_report");
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
      diagnostics,
    });
    await emitSection("report", {
      metadata,
      markdown,
    });
    await emitStageCompleted("render_report", {
      markdownLength: markdown.length,
      reportStatus,
    });

    if (reportFormatSkill) {
      await emitStageStarted("validate_report_format");
      const reportFormatCheck = (await bindingRegistry.execute(reportFormatSkill, { markdown })) as {
        valid: boolean;
        issues: string[];
      };
      if (!reportFormatCheck.valid) {
        throw new ValidationError("Report format skill validation failed", reportFormatCheck.issues);
      }
      await emitStageCompleted("validate_report_format", { valid: true });
    }

    await emitStageStarted("write_report");
    const reportResult = await writeMarketReportFile({
      reportsDir: context.paths.reportsDir,
      markdown,
      baseDate,
    });
    await emitSection("report", {
      metadata,
      markdown,
      fileName: reportResult.fileName,
      filePath: reportResult.filePath,
    });
    await emitStageCompleted("write_report", {
      fileName: reportResult.fileName,
    });

    await emitStageStarted("finalize_run_log");
    await appendRunLogEntry(context.paths.runLogPath, {
      runId,
      triggerType,
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
    await emitStageCompleted("finalize_run_log");

    const elapsedMs = Date.now() - startedAtMs;
    await emit({
      type: "run.completed",
      reportStatus,
      reportFilePath: reportResult.filePath,
      reportFileName: reportResult.fileName,
      elapsedMs,
    });

    return {
      status: "completed",
      runId,
      triggerType,
      generatedAt,
      reportStatus,
      reportFilePath: reportResult.filePath,
      reportFileName: reportResult.fileName,
      markdown,
      elapsedMs,
    };
  } catch (error) {
    const errorCode = toErrorCode(error);
    const message = error instanceof Error ? error.message : String(error);

    await emitLog("error", message);

    try {
      const context = createAppContext({
        cwd: options.cwd,
        env: options.env,
      });
      await appendRunLogEntry(context.paths.runLogPath, {
        runId,
        triggerType,
        startedAt: generatedAtForFailure,
        endedAt: new Date().toISOString(),
        status: "failed",
        llmStatus: "not_used",
        messages: [message],
      });
    } catch {
      // Avoid masking the original error path if logging cannot be initialized.
    }

    await emit({
      type: "run.failed",
      message,
      errorCode,
    });
    throw new RunReviewServiceExecutionError(message, errorCode, error);
  }
}
