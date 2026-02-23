import { formatLocalDate, formatLocalTimeHm } from "../shared/time";
import { ValidationError } from "../shared/errors";

export const REPORT_FILE_NAME_REGEX = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}_market-report\.md$/;

export function buildReportFileName(date: Date = new Date()): string {
  return `${formatLocalDate(date)}-${formatLocalTimeHm(date)}_market-report.md`;
}

export function isValidReportFileName(fileName: string): boolean {
  return REPORT_FILE_NAME_REGEX.test(fileName);
}

export function assertValidReportFileName(fileName: string): string {
  if (!isValidReportFileName(fileName)) {
    throw new ValidationError("Invalid report filename format", [
      `Expected ${REPORT_FILE_NAME_REGEX.source}`,
      `Received ${fileName}`,
    ]);
  }

  return fileName;
}
