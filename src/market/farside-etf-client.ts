import type { EtfFlowAsset, EtfFlowDataset, EtfFlowDailyRow, EtfFlowSnapshot } from "../shared/types";
import { ValidationError } from "../shared/errors";

type FetchFn = typeof fetch;

const FARSIDE_ALL_DATA_URLS: Record<EtfFlowAsset, string> = {
  btc: "https://farside.co.uk/bitcoin-etf-flow-all-data/",
  eth: "https://farside.co.uk/ethereum-etf-flow-all-data/",
};

const MONTH_BY_ABBR: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/&minus;|&#8722;/gi, "-")
    .replace(/&#(\d+);/g, (_, code) => {
      const parsed = Number.parseInt(code, 10);
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : _;
    });
}

function stripHtmlToCellText(input: string): string {
  const withLineBreaks = input.replace(/<br\s*\/?>/gi, " ");
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, "");
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

function parseColspan(attrs: string): number {
  const match = attrs.match(/\bcolspan\s*=\s*["']?(\d+)["']?/i);
  const parsed = match ? Number.parseInt(match[1]!, 10) : 1;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function extractHtmlTables(html: string): string[][][] {
  const sanitized = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const tables: string[][][] = [];
  const tableMatches = sanitized.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];

  for (const tableHtml of tableMatches) {
    const rows: string[][] = [];
    const rowMatches = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
    for (const rowHtml of rowMatches) {
      const cells: string[] = [];
      const cellRegex = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const attrs = cellMatch[2] ?? "";
        const inner = cellMatch[3] ?? "";
        const text = stripHtmlToCellText(inner);
        const colspan = parseColspan(attrs);
        for (let i = 0; i < colspan; i += 1) {
          cells.push(text);
        }
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
    }
    if (rows.length > 0) {
      tables.push(rows);
    }
  }

  return tables;
}

function looksLikeDateCell(value: string): boolean {
  return /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(value.trim());
}

function parseFarsideDate(dateLabel: string): string {
  const match = dateLabel.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) {
    throw new ValidationError("Invalid Farside ETF date", [`Unsupported date label: ${dateLabel}`]);
  }

  const day = Number.parseInt(match[1]!, 10);
  const month = MONTH_BY_ABBR[match[2]!.toLowerCase()];
  const year = Number.parseInt(match[3]!, 10);
  if (!month) {
    throw new ValidationError("Invalid Farside ETF date", [`Unknown month in date label: ${dateLabel}`]);
  }
  return `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseFlowValueUsdM(input: string): number | null {
  let value = input
    .replace(/\u2212/g, "-")
    .replace(/,/g, "")
    .replace(/\*/g, "")
    .replace(/\$/g, "")
    .trim();

  if (value.length === 0 || /^[-–—]+$/.test(value)) {
    return null;
  }

  let negative = false;
  const parenMatch = value.match(/^\((.*)\)$/);
  if (parenMatch) {
    negative = true;
    value = parenMatch[1]!.trim();
  }

  value = value.replace(/[^0-9.+-]/g, "");
  if (value.length === 0 || value === "+" || value === "-") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return negative ? -Math.abs(parsed) : parsed;
}

function countTickerLikeCells(row: string[]): number {
  return row.filter((cell) => /^[A-Z]{2,5}$/.test(cell.trim())).length;
}

function scoreTableForFarsideDataset(rows: string[][]): number {
  const dateRowCount = rows.filter((row) => looksLikeDateCell(row[0] ?? "")).length;
  if (dateRowCount === 0) {
    return -1;
  }

  const headerTickerSignal = rows
    .slice(0, 12)
    .map((row) => countTickerLikeCells(row))
    .reduce((max, count) => Math.max(max, count), 0);
  const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  return dateRowCount * 100 + headerTickerSignal * 10 + maxCols;
}

function selectFarsideDataTable(tables: string[][][]): string[][] {
  let bestRows: string[][] | undefined;
  let bestScore = -1;

  for (const rows of tables) {
    const score = scoreTableForFarsideDataset(rows);
    if (score > bestScore) {
      bestRows = rows;
      bestScore = score;
    }
  }

  if (!bestRows || bestScore < 0) {
    throw new ValidationError("Farside ETF scraping failed", ["Could not locate ETF flow data table"]);
  }

  return bestRows;
}

function padRow(row: string[], width: number): string[] {
  if (row.length >= width) {
    return row.slice(0, width);
  }
  return [...row, ...Array.from({ length: width - row.length }, () => "")];
}

function inferColumnLabels(rows: string[][], dataWidth: number): string[] {
  const sameWidthHeaderRows = rows.filter((row) => row.length === dataWidth);
  const tickerRow =
    sameWidthHeaderRows
      .slice()
      .sort((a, b) => countTickerLikeCells(b) - countTickerLikeCells(a))[0] ??
    Array.from({ length: dataWidth }, () => "");

  const labels = padRow(tickerRow, dataWidth).map((cell) => cell.trim());

  labels[0] = "Date";
  labels[dataWidth - 1] = "Total";

  for (let index = 1; index < dataWidth - 1; index += 1) {
    const current = labels[index] ?? "";
    if (/^[A-Z]{2,5}$/.test(current)) {
      continue;
    }

    const fallback = sameWidthHeaderRows
      .map((row) => row[index]?.trim() ?? "")
      .find((cell) => /^[A-Z]{2,5}$/.test(cell));

    labels[index] = fallback ?? `ETF_${index}`;
  }

  return labels;
}

function computeTotalNetFlow(row: EtfFlowDailyRow): number | null {
  if (row.totalNetFlowUsdM !== null) {
    return row.totalNetFlowUsdM;
  }
  const values = Object.values(row.byEtfNetFlowUsdM).filter((value): value is number => typeof value === "number");
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0);
}

function hasAnyEtfFlowValue(row: EtfFlowDailyRow): boolean {
  return Object.values(row.byEtfNetFlowUsdM).some((value) => value !== null);
}

function isPlaceholderEmptyDailyRow(row: EtfFlowDailyRow): boolean {
  // Farside may publish the current trading day row before populating ETF cells.
  // In that case ETF columns are blank (all null) and the total often appears as 0.
  return !hasAnyEtfFlowValue(row) && row.totalNetFlowUsdM === 0;
}

function parseFarsideDatasetFromHtml(params: {
  html: string;
  asset: EtfFlowAsset;
  pageUrl: string;
  capturedAt?: string;
}): EtfFlowDataset {
  const tables = extractHtmlTables(params.html);
  const tableRows = selectFarsideDataTable(tables);
  const firstDataRowIndex = tableRows.findIndex((row) => looksLikeDateCell(row[0] ?? ""));

  if (firstDataRowIndex < 0) {
    throw new ValidationError("Farside ETF scraping failed", ["No dated rows found in ETF flow table"]);
  }

  const dataWidth = tableRows[firstDataRowIndex]!.length;
  const columnLabels = inferColumnLabels(tableRows.slice(0, firstDataRowIndex), dataWidth);
  const etfTickers = columnLabels.slice(1, -1);

  const rows: EtfFlowDailyRow[] = [];
  for (const rawRow of tableRows.slice(firstDataRowIndex)) {
    const row = padRow(rawRow, dataWidth);
    const rowLabel = (row[0] ?? "").trim();
    if (!rowLabel) {
      continue;
    }

    if (["total", "average", "maximum", "minimum"].includes(rowLabel.toLowerCase())) {
      break;
    }
    if (!looksLikeDateCell(rowLabel)) {
      continue;
    }

    const date = parseFarsideDate(rowLabel);
    const byEtfNetFlowUsdM: Record<string, number | null> = {};
    for (let columnIndex = 1; columnIndex < dataWidth - 1; columnIndex += 1) {
      byEtfNetFlowUsdM[columnLabels[columnIndex]!] = parseFlowValueUsdM(row[columnIndex] ?? "");
    }

    const parsedRow: EtfFlowDailyRow = {
      date,
      byEtfNetFlowUsdM,
      totalNetFlowUsdM: parseFlowValueUsdM(row[dataWidth - 1] ?? ""),
    };

    if (isPlaceholderEmptyDailyRow(parsedRow)) {
      continue;
    }

    if (computeTotalNetFlow(parsedRow) !== null || hasAnyEtfFlowValue(parsedRow)) {
      rows.push(parsedRow);
    }
  }

  if (rows.length === 0) {
    throw new ValidationError("Farside ETF scraping failed", ["ETF flow table parsed but no daily rows were extracted"]);
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  return {
    asset: params.asset,
    source: "farside",
    pageUrl: params.pageUrl,
    capturedAt: params.capturedAt ?? new Date().toISOString(),
    etfTickers,
    rows,
  };
}

export interface FarsideEtfClient {
  fetchEtfFlowSnapshot(): Promise<EtfFlowSnapshot>;
}

export function parseFarsideEtfDatasetHtml(
  html: string,
  options: {
    asset: EtfFlowAsset;
    pageUrl?: string;
    capturedAt?: string;
  },
): EtfFlowDataset {
  return parseFarsideDatasetFromHtml({
    html,
    asset: options.asset,
    pageUrl: options.pageUrl ?? FARSIDE_ALL_DATA_URLS[options.asset],
    capturedAt: options.capturedAt,
  });
}

export function createFarsideEtfClient(options: { fetchFn?: FetchFn } = {}): FarsideEtfClient {
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async fetchEtfFlowSnapshot() {
      const capturedAt = new Date().toISOString();
      const assets: EtfFlowAsset[] = ["btc", "eth"];

      const datasets = await Promise.all(
        assets.map(async (asset) => {
          const url = FARSIDE_ALL_DATA_URLS[asset];
          const response = await fetchFn(url);
          const body = await response.text();
          if (!response.ok) {
            throw new ValidationError("Farside ETF request failed", [`${asset.toUpperCase()} HTTP ${response.status}`]);
          }
          return parseFarsideDatasetFromHtml({
            html: body,
            asset,
            pageUrl: url,
            capturedAt,
          });
        }),
      );

      return {
        source: "farside",
        capturedAt,
        datasets,
      } satisfies EtfFlowSnapshot;
    },
  };
}
