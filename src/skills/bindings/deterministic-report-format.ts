export async function deterministicReportFormatBinding(input: {
  markdown: string;
}): Promise<{ valid: boolean; issues: string[] }> {
  const headings = [
    "## 0. Metadata",
    "## 1. Executive Summary",
    "## 2. Market Regime & Position Wording",
    "## 3. Risk & Invalidation / Sentiment Score",
    "## 4. Tactical Positioning & Probabilistic Outlook",
    "## 5. Macro Dashboard",
    "## 6. Crypto Dashboard",
    "## 7. Flow & ETF Data",
    "## 8. Top 20 News (scored + classified)",
    "## 9. Sources & References",
  ];
  const issues = headings.filter((heading) => !input.markdown.includes(heading)).map((heading) => `Missing ${heading}`);
  return { valid: issues.length === 0, issues };
}
