import { PUBLIC_DATA_BASE_URL } from "../constants";

export function buildPublicAssetUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/, "");
  return `${PUBLIC_DATA_BASE_URL}${normalizedPath}`;
}

export function normalizeReportPath(reportFilePath: string): string {
  if (reportFilePath.startsWith("reports/")) {
    return reportFilePath;
  }
  const reportsSegment = "/reports/";
  const reportsIndex = reportFilePath.lastIndexOf(reportsSegment);
  if (reportsIndex >= 0) {
    return reportFilePath.slice(reportsIndex + 1);
  }
  return reportFilePath.replace(/^\/+/, "");
}
