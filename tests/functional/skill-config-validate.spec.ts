import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { runValidateConfigCommand } from "../../src/cli/commands/validate-config";
import { createTempWorkspace } from "../helpers/temp-workspace";

const validFeedCatalog = `| category | source | url | enabled | notes |
|---|---|---|---|---|
| crypto | Example | https://example.com/feed.xml | true | fixture |
`;

const validWatchlist = JSON.stringify([
  {
    id: "btc-usd",
    symbol: "BTC",
    name: "Bitcoin",
    assetClass: "crypto",
    provider: "coingecko",
    providerKey: "bitcoin",
    volumeRelevant: true,
    enabled: true,
  },
]);

const validSkill = `---
id: sentiment-v1
name: Sentiment
type: sentiment
version: "1.0"
enabled: true
binding:
  type: llm_sentiment
  target: sentiment_assessment
description: test
input:
  schema: in
output:
  schema: out
---

## Description

test

## Input

test

## Output

test

## Usage Rules

test
`;

describe("config validate skills contract (functional)", () => {
  it("passes valid skills and fails invalid skills", async () => {
    const workspace = await createTempWorkspace();
    try {
      await mkdir(workspace.path("config"), { recursive: true });
      await mkdir(workspace.path("skills", "sentiment"), { recursive: true });
      await mkdir(workspace.path("skills", "outlook"), { recursive: true });
      await mkdir(workspace.path("skills", "positioning"), { recursive: true });
      await mkdir(workspace.path("reports"), { recursive: true });
      await mkdir(workspace.path("logs"), { recursive: true });

      await writeFile(workspace.path("config", "rss-feeds.md"), validFeedCatalog);
      await writeFile(workspace.path("config", "watchlist.json"), validWatchlist);
      await writeFile(workspace.path("skills", "sentiment", "skill.md"), validSkill);

      const ok = await runValidateConfigCommand({
        cwd: workspace.root,
        env: { REPORTS_DIR: "reports", RUN_LOG_PATH: "logs/runs.jsonl" },
        logger: { log: () => {}, error: () => {} },
      });
      expect(ok).toBe(0);

      await writeFile(workspace.path("skills", "sentiment", "skill.md"), validSkill.replace("## Usage Rules", "## Rules"));
      const bad = await runValidateConfigCommand({
        cwd: workspace.root,
        env: { REPORTS_DIR: "reports", RUN_LOG_PATH: "logs/runs.jsonl" },
        logger: { log: () => {}, error: () => {} },
      });
      expect(bad).toBe(2);
    } finally {
      await workspace.cleanup();
    }
  });
});
