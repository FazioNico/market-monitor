import { describe, expect, it } from "vitest";

import { formatElapsedDuration } from "../../../src/cli/progress-indicator";

describe("cli progress indicator", () => {
  it("formats short elapsed durations as mm:ss", () => {
    expect(formatElapsedDuration(0)).toBe("00:00");
    expect(formatElapsedDuration(999)).toBe("00:00");
    expect(formatElapsedDuration(65_000)).toBe("01:05");
  });

  it("formats long elapsed durations as hh:mm:ss", () => {
    expect(formatElapsedDuration(3_661_000)).toBe("01:01:01");
  });
});
