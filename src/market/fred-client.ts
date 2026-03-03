import type { MacroSeriesObservation } from "../shared/types";
import { ValidationError } from "../shared/errors";

type FetchFn = typeof fetch;

interface FredResponse {
  units?: string;
  observations?: Array<{ date?: string; value?: string }>;
}

export function parseFredSeriesObservationsJson(input: {
  json: string;
  seriesId: string;
  label: string;
  fetchedAt?: string;
}): MacroSeriesObservation[] {
  let parsed: FredResponse;
  try {
    parsed = JSON.parse(input.json) as FredResponse;
  } catch {
    throw new ValidationError("Invalid FRED JSON", ["Response must be valid JSON"]);
  }

  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const observations = Array.isArray(parsed.observations) ? parsed.observations : [];

  return observations
    .map((obs) => ({
      observedAt: String(obs.date ?? ""),
      value: Number(obs.value),
      units: parsed.units,
    }))
    .filter((obs) => obs.observedAt && Number.isFinite(obs.value))
    .map(
      (obs) =>
        ({
          seriesId: input.seriesId,
          label: input.label,
          observedAt: obs.observedAt,
          value: obs.value,
          fetchedAt,
          provider: "fred",
          units: obs.units,
        }) satisfies MacroSeriesObservation,
    );
}

export interface FredClient {
  fetchSeriesObservations(params: { seriesId: string; label: string; limit?: number }): Promise<MacroSeriesObservation[]>;
}

export function createFredClient(options: {
  fetchFn?: FetchFn;
  apiKey?: string;
  baseUrl?: string;
} = {}): FredClient {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = options.baseUrl ?? "https://api.stlouisfed.org/fred";

  return {
    async fetchSeriesObservations({ seriesId, label, limit = 12 }) {
      const url = new URL(`${baseUrl}/series/observations`);
      url.searchParams.set("series_id", seriesId);
      url.searchParams.set("file_type", "json");
      url.searchParams.set("sort_order", "desc");
      url.searchParams.set("limit", String(limit));
      if (options.apiKey) {
        url.searchParams.set("api_key", options.apiKey);
      }
      const response = await fetchFn(url.toString());
      const body = await response.text();
      if (!response.ok) {
        throw new ValidationError("FRED request failed", [`HTTP ${response.status}`]);
      }
      return parseFredSeriesObservationsJson({ json: body, seriesId, label });
    },
  };
}
