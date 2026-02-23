export async function deterministicReportFormatBinding(input: {
  markdown: string;
}): Promise<{ valid: boolean; issues: string[] }> {
  const headings = [
    "## Report Metadata",
    "## News Summary / RSS Ingestion Summary",
    "## Market Snapshot",
    "## Regime Detection",
    "## Sentiment Scoring",
    "## Probabilistic Outlook",
    "## Risk & Invalidation",
    "## Position Wording",
  ];
  const issues = headings.filter((heading) => !input.markdown.includes(heading)).map((heading) => `Missing ${heading}`);
  return { valid: issues.length === 0, issues };
}
