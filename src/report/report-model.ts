import type { ReportStatus, TriggerType } from "../shared/types";

export interface ReportMetadata {
  reportId: string;
  runId: string;
  generatedAt: string;
  triggerType: TriggerType;
  status: ReportStatus;
  dataSources: string[];
  omissionReasons: string[];
}

export interface ReportDocument {
  metadata: ReportMetadata;
  sections: Record<string, string>;
}

export function createRunId(): string {
  return `run_${crypto.randomUUID()}`;
}

export function createReportId(): string {
  return `report_${crypto.randomUUID()}`;
}

export function createReportMetadata(input: {
  runId: string;
  triggerType: TriggerType;
  generatedAt?: string;
  status?: ReportStatus;
  dataSources?: string[];
  omissionReasons?: string[];
}): ReportMetadata {
  return {
    reportId: createReportId(),
    runId: input.runId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    triggerType: input.triggerType,
    status: input.status ?? "complete",
    dataSources: input.dataSources ?? [],
    omissionReasons: input.omissionReasons ?? [],
  };
}

export function createReportDocument(input: {
  metadata: ReportMetadata;
  sections?: Record<string, string>;
}): ReportDocument {
  return {
    metadata: input.metadata,
    sections: input.sections ?? {},
  };
}
