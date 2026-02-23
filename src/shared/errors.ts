export class AppError extends Error {
  readonly code: string;

  constructor(message: string, code = "APP_ERROR", options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message, "VALIDATION_ERROR");
    this.issues = issues;
  }
}

export class CliUsageError extends AppError {
  constructor(message: string) {
    super(message, "CLI_USAGE_ERROR");
  }
}
