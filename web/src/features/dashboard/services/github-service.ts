import {
  GITHUB_DEFAULT_BRANCH_CANDIDATES,
  GITHUB_OWNER,
  GITHUB_REPO,
} from "../constants";

export async function fetchLatestCommitSha(
  signal?: AbortSignal,
): Promise<string | undefined> {
  for (const branch of GITHUB_DEFAULT_BRANCH_CANDIDATES) {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
      {
        signal,
        headers: {
          accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      continue;
    }

    const payload = (await response.json()) as Array<{ sha?: string }>;
    const first = Array.isArray(payload) ? payload[0] : undefined;
    const shortSha =
      typeof first?.sha === "string" && first.sha.length >= 7
        ? first.sha.slice(0, 7)
        : undefined;

    if (shortSha) {
      return shortSha;
    }
  }

  return undefined;
}
