import { useEffect, useState } from "react";

import { fetchLatestCommitSha } from "../services/github-service";

export function SoftwareVersionPill({
  version,
  fallbackSha,
}: {
  version: string;
  fallbackSha?: string;
}) {
  const [commitSha, setCommitSha] = useState<string | undefined>(fallbackSha);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadLatestCommitSha(): Promise<void> {
      try {
        const latestSha = await fetchLatestCommitSha(controller.signal);
        if (!cancelled && latestSha) {
          setCommitSha(latestSha);
        }
      } catch {
        // Keep fallback SHA when GitHub API is unavailable or rate-limited.
      }
    }

    void loadLatestCommitSha();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fallbackSha]);

  return (
    <div className="data-pill">
      Software Version: v{version}
      {commitSha ? ` - ${commitSha}` : ""}
    </div>
  );
}
