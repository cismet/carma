import { describe, expect, it } from "vitest";

import {
  getDayOfYear,
  getDaysInYear,
  getUtcDateForDayOfYear,
  offsetYearDay,
} from "./calendar";

describe("calendar", () => {
  it("resolves leap years and UTC day-of-year values", () => {
    expect(getDaysInYear(2024)).toBe(366);
    expect(getDaysInYear(2025)).toBe(365);
    expect(getDayOfYear(2024, 1, 29)).toBe(60);
    expect(getUtcDateForDayOfYear(2024, 60).toISOString()).toBe(
      "2024-02-29T00:00:00.000Z"
    );
  });

  it("offsets year-day values across year boundaries", () => {
    expect(offsetYearDay({ year: 2024, dayOfYear: 366 }, 1)).toEqual({
      year: 2025,
      dayOfYear: 1,
    });
    expect(offsetYearDay({ year: 2025, dayOfYear: 1 }, -1)).toEqual({
      year: 2024,
      dayOfYear: 366,
    });
  });
});
