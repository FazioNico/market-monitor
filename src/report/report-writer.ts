import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildReportFileName, isValidReportFileName } from "./file-naming";

export interface ReportWriteResult {
  fileName: string;
  filePath: string;
  resolvedDate: Date;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

export async function writeMarketReportFile(input: {
  reportsDir: string;
  markdown: string;
  baseDate?: Date;
}): Promise<ReportWriteResult> {
  await mkdir(input.reportsDir, { recursive: true });

  const baseDate = input.baseDate ?? new Date();

  for (let offset = 0; offset < 1440; offset += 1) {
    const candidateDate = addMinutes(baseDate, offset);
    const fileName = buildReportFileName(candidateDate);
    if (!isValidReportFileName(fileName)) {
      continue;
    }

    const filePath = join(input.reportsDir, fileName);
    if (await fileExists(filePath)) {
      continue;
    }

    await writeFile(filePath, input.markdown, "utf8");
    return { fileName, filePath, resolvedDate: candidateDate };
  }

  throw new Error("Unable to allocate a unique report filename within 24h collision window");
}
