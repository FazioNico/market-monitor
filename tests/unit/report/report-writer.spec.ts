import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { writeMarketReportFile } from "../../../src/report/report-writer";
import { createTempWorkspace } from "../../helpers/temp-workspace";

describe("report writer", () => {
  it("prevents overwriting by allocating a new valid filename on collision", async () => {
    const workspace = await createTempWorkspace();
    try {
      const baseDate = new Date(2026, 1, 23, 8, 15, 0);
      const first = await writeMarketReportFile({
        reportsDir: workspace.path("reports"),
        markdown: "# one\n",
        baseDate,
      });
      const second = await writeMarketReportFile({
        reportsDir: workspace.path("reports"),
        markdown: "# two\n",
        baseDate,
      });

      expect(first.fileName).not.toBe(second.fileName);
      expect(first.fileName).toMatch(/_market-report\.md$/);
      expect(second.fileName).toMatch(/_market-report\.md$/);
      expect(await readFile(first.filePath, "utf8")).toContain("# one");
      expect(await readFile(second.filePath, "utf8")).toContain("# two");
    } finally {
      await workspace.cleanup();
    }
  });
});
