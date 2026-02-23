import { describe, expect, it } from "vitest";

import {
  formatLocalDate,
  formatLocalDateLabel,
  formatLocalDateTimeLabel,
  formatLocalTimeHm,
  pad2,
} from "../../../src/shared/time";

describe("local time helpers", () => {
  it("formats local date labels as YYYY-MM-DD", () => {
    const date = new Date(2026, 1, 3, 4, 5, 6);

    expect(formatLocalDate(date)).toBe("2026-02-03");
  });

  it("formats local time labels with zero-padded 24h hours and minutes", () => {
    const date = new Date(2026, 1, 3, 4, 5, 6);

    expect(formatLocalTimeHm(date)).toBe("04-05");
  });

  it("zero pads single-digit values", () => {
    expect(pad2(0)).toBe("00");
    expect(pad2(7)).toBe("07");
    expect(pad2(12)).toBe("12");
  });

  it("renders local date labels used for history grouping and diagnostics", () => {
    const date = new Date(2026, 1, 3, 14, 9, 0);
    expect(formatLocalDateLabel(date)).toBe("2026-02-03");
    expect(formatLocalDateTimeLabel(date)).toBe("2026-02-03 14:09");
  });
});
