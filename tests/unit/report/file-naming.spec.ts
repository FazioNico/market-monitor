import { describe, expect, it } from "vitest";

import {
  REPORT_FILE_NAME_REGEX,
  buildReportFileName,
  isValidReportFileName,
} from "../../../src/report/file-naming";

describe("report file naming", () => {
  it("formats filenames as YYYY-MM-DD-hh-mm_market-report.md", () => {
    const date = new Date(2026, 1, 23, 8, 5, 12);

    expect(buildReportFileName(date)).toBe("2026-02-23-08-05_market-report.md");
  });

  it("validates filenames against the contract regex", () => {
    expect(REPORT_FILE_NAME_REGEX.test("2026-02-23-08-05_market-report.md")).toBe(true);
    expect(isValidReportFileName("2026-02-23-08-05_market-report.md")).toBe(true);

    expect(isValidReportFileName("2026-2-23-8-5_market-report.md")).toBe(false);
    expect(isValidReportFileName("2026-02-23-08-05-market-report.md")).toBe(false);
    expect(isValidReportFileName("market-report.md")).toBe(false);
  });
});
