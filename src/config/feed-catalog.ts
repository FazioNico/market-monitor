import matter from "gray-matter";
import { readFile } from "node:fs/promises";

import { ValidationError } from "../shared/errors";
import type { FeedCatalogEntry } from "../shared/types";

const REQUIRED_COLUMNS = ["category", "source", "url", "enabled", "notes"] as const;
const DEFAULT_LOOKBACK_HOURS = 24;

export interface FeedCatalogParseOptions {
  lookbackHoursOverride?: number;
}

export interface FeedCatalog {
  allEntries: FeedCatalogEntry[];
  entries: FeedCatalogEntry[];
  defaultLookbackHours: number;
  effectiveLookbackHours: number;
}

function normalizeUrl(input: string): string {
  const url = new URL(input.trim());
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ValidationError("Invalid RSS feed URL protocol", [
      `Only http(s) URLs are allowed: ${input}`,
    ]);
  }
  return url.toString();
}

function parsePositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`Invalid ${fieldName}`, [`${fieldName} must be a positive number`]);
  }
  return value;
}

function parseEnabled(value: string, rowIndex: number): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new ValidationError("Invalid enabled value in feed catalog", [
    `Row ${rowIndex + 1}: enabled must be true or false`,
  ]);
}

function parseMarkdownTable(tableMarkdown: string): Array<Record<string, string>> {
  const lines = tableMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 3) {
    throw new ValidationError("Feed catalog table is missing rows", [
      "Table must contain a header, separator, and at least one row",
    ]);
  }

  const [headerLine, separatorLine, ...rowLines] = lines;
  if (!headerLine || !separatorLine) {
    throw new ValidationError("Feed catalog table is malformed", ["Missing header or separator line"]);
  }

  const headers = splitTableLine(headerLine).map((header) => header.toLowerCase());
  const separatorCells = splitTableLine(separatorLine);

  if (headers.length !== separatorCells.length) {
    throw new ValidationError("Feed catalog table header/separator mismatch", [
      "Header and separator column counts must match",
    ]);
  }

  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new ValidationError("Feed catalog table missing required columns", [
      `Missing columns: ${missingColumns.join(", ")}`,
    ]);
  }

  const rows: Array<Record<string, string>> = [];
  for (const rowLine of rowLines) {
    const cells = splitTableLine(rowLine);
    if (cells.length !== headers.length) {
      throw new ValidationError("Feed catalog row column count mismatch", [
        `Row "${rowLine}" does not match header column count`,
      ]);
    }

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new ValidationError("Feed catalog table is empty", ["At least one feed row is required"]);
  }

  return rows;
}

function splitTableLine(line: string): string[] {
  if (!line.startsWith("|")) {
    throw new ValidationError("Invalid feed catalog table line", [`Line must start with '|': ${line}`]);
  }

  const trimmed = line.endsWith("|") ? line.slice(1, -1) : line.slice(1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function extractSingleMarkdownTable(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("|")) {
      current.push(rawLine);
      continue;
    }

    flush();
  }
  flush();

  if (blocks.length === 0) {
    throw new ValidationError("Feed catalog table not found", [
      "Expected one Markdown table in config/rss-feeds.md",
    ]);
  }

  if (blocks.length > 1) {
    throw new ValidationError("Multiple feed catalog tables found", [
      "Exactly one Markdown table is supported",
    ]);
  }

  return blocks[0]!;
}

function resolveLookbackHours(frontMatterValue: unknown, options: FeedCatalogParseOptions): {
  defaultLookbackHours: number;
  effectiveLookbackHours: number;
} {
  const defaultLookbackHours =
    frontMatterValue === undefined
      ? DEFAULT_LOOKBACK_HOURS
      : parsePositiveNumber(frontMatterValue, "default_lookback_hours");

  const effectiveLookbackHours =
    options.lookbackHoursOverride === undefined
      ? defaultLookbackHours
      : parsePositiveNumber(options.lookbackHoursOverride, "lookbackHoursOverride");

  return {
    defaultLookbackHours,
    effectiveLookbackHours,
  };
}

export function parseFeedCatalogMarkdown(
  markdown: string,
  options: FeedCatalogParseOptions = {},
): FeedCatalog {
  const { content, data } = matter(markdown);
  const tableMarkdown = extractSingleMarkdownTable(content);
  const rows = parseMarkdownTable(tableMarkdown);
  const seenUrls = new Set<string>();

  const allEntries = rows.map((row, index) => {
    const category = (row.category ?? "").trim();
    const source = (row.source ?? "").trim();
    const notes = (row.notes ?? "").trim();

    if (!category || !source) {
      throw new ValidationError("Feed catalog row missing required text fields", [
        `Row ${index + 1}: category and source are required`,
      ]);
    }

    const url = normalizeUrl(row.url ?? "");
    const enabled = parseEnabled(row.enabled ?? "", index);
    const normalizedKey = url.toLowerCase();

    if (seenUrls.has(normalizedKey)) {
      throw new ValidationError("Duplicate feed URL in feed catalog", [
        `Duplicate URL detected: ${url}`,
      ]);
    }
    seenUrls.add(normalizedKey);

    return {
      category,
      source,
      url,
      enabled,
      notes: notes || undefined,
    } satisfies FeedCatalogEntry;
  });

  const { defaultLookbackHours, effectiveLookbackHours } = resolveLookbackHours(
    data.default_lookback_hours,
    options,
  );

  return {
    allEntries,
    entries: allEntries.filter((entry) => entry.enabled),
    defaultLookbackHours,
    effectiveLookbackHours,
  };
}

export async function readFeedCatalogFile(
  filePath: string,
  options: FeedCatalogParseOptions = {},
): Promise<FeedCatalog> {
  const contents = await readFile(filePath, "utf8");
  return parseFeedCatalogMarkdown(contents, options);
}
