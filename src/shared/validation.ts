import { ValidationError } from "./errors";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function ensureNonEmptyString(value: string | undefined, fieldName: string): string {
  const trimmed = normalizeOptionalString(value);

  if (!trimmed) {
    throw new ValidationError(`${fieldName} must be a non-empty string`, [
      `${fieldName} is missing or empty`,
    ]);
  }

  return trimmed;
}

export function ensureStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ValidationError(`${fieldName} must be an array of strings`, [
      `${fieldName} must be an array<string>`,
    ]);
  }

  return value;
}
