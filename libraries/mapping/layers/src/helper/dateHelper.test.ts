import { isCurrentlyFeatured, parseDate } from "./dateHelper";

describe("parseDate", () => {
  it("should parse a valid date string", () => {
    expect(parseDate("2024.06.15")).toEqual({
      year: 2024,
      month: 6,
      day: 15,
    });
  });

  it("should handle wildcard year", () => {
    expect(parseDate("*.06.15")).toEqual({
      year: null,
      month: 6,
      day: 15,
    });
  });

  it("should handle wildcard month", () => {
    expect(parseDate("2024.*.15")).toEqual({
      year: 2024,
      month: null,
      day: 15,
    });
  });

  it("should handle wildcard day", () => {
    expect(parseDate("2024.06.*")).toEqual({
      year: 2024,
      month: 6,
      day: null,
    });
  });

  it("should handle all wildcards", () => {
    expect(parseDate("*.*.*")).toEqual({
      year: null,
      month: null,
      day: null,
    });
  });

  it("should return null for invalid format", () => {
    expect(parseDate("2024-06-15")).toBeNull();
    expect(parseDate("2024.06")).toBeNull();
    expect(parseDate("invalid")).toBeNull();
  });
});

describe("isCurrentlyFeatured", () => {
  const createDate = (year: number, month: number, day: number) =>
    new Date(year, month - 1, day);

  describe("edge cases", () => {
    it("should return false when both parameters are undefined", () => {
      expect(isCurrentlyFeatured(undefined, undefined)).toBe(false);
    });

    it("should return false when both parameters are empty strings", () => {
      expect(isCurrentlyFeatured("", "")).toBe(false);
    });

    it("should return false for invalid date format in featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("invalid", undefined, refDate)).toBe(false);
    });

    it("should return false for invalid date format in featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "invalid", refDate)).toBe(false);
    });
  });

  describe("featuredFrom only", () => {
    it("should return true when reference date is after featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.06.01", undefined, refDate)).toBe(true);
    });

    it("should return true when reference date equals featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.06.15", undefined, refDate)).toBe(true);
    });

    it("should return false when reference date is before featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.06.20", undefined, refDate)).toBe(false);
    });

    it("should return false when featuredFrom year is in the future", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2025.01.01", undefined, refDate)).toBe(false);
    });

    it("should return true when featuredFrom year is in the past", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2023.12.31", undefined, refDate)).toBe(true);
    });

    it("should return false when same year but featuredFrom month is in the future", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.07.01", undefined, refDate)).toBe(false);
    });

    it("should return true when same year but featuredFrom month is in the past", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.05.31", undefined, refDate)).toBe(true);
    });
  });

  describe("featuredUntil only", () => {
    it("should return true when reference date is before featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2024.06.20", refDate)).toBe(true);
    });

    it("should return true when reference date equals featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2024.06.15", refDate)).toBe(true);
    });

    it("should return false when reference date is after featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2024.06.10", refDate)).toBe(false);
    });

    it("should return false when featuredUntil year is in the past", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2023.12.31", refDate)).toBe(false);
    });

    it("should return true when featuredUntil year is in the future", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2025.01.01", refDate)).toBe(true);
    });

    it("should return false when same year but featuredUntil month is in the past", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2024.05.31", refDate)).toBe(false);
    });

    it("should return true when same year but featuredUntil month is in the future", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2024.07.01", refDate)).toBe(true);
    });
  });

  describe("both featuredFrom and featuredUntil", () => {
    it("should return true when reference date is within range", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.06.01", "2024.06.30", refDate)).toBe(
        true
      );
    });

    it("should return true when reference date equals featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.06.15", "2024.06.30", refDate)).toBe(
        true
      );
    });

    it("should return true when reference date equals featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.06.01", "2024.06.15", refDate)).toBe(
        true
      );
    });

    it("should return false when reference date is before range", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.06.20", "2024.06.30", refDate)).toBe(
        false
      );
    });

    it("should return false when reference date is after range", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.06.01", "2024.06.10", refDate)).toBe(
        false
      );
    });
  });

  describe("wildcard year (*)", () => {
    it("should match any year for featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("*.06.01", undefined, refDate)).toBe(true);
    });

    it("should match any year for featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "*.06.30", refDate)).toBe(true);
    });

    it("should still check month when year is wildcard in featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("*.07.01", undefined, refDate)).toBe(false);
    });

    it("should still check month when year is wildcard in featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "*.05.31", refDate)).toBe(false);
    });
  });

  describe("wildcard month (*)", () => {
    it("should match any month for featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.*.01", undefined, refDate)).toBe(true);
    });

    it("should match any month for featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2024.*.30", refDate)).toBe(true);
    });

    it("should still check day when month is wildcard in featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.*.20", undefined, refDate)).toBe(false);
    });

    it("should still check day when month is wildcard in featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2024.*.10", refDate)).toBe(false);
    });
  });

  describe("wildcard day (*)", () => {
    it("should match any day for featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.06.*", undefined, refDate)).toBe(true);
    });

    it("should match any day for featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2024.06.*", refDate)).toBe(true);
    });

    it("should respect month even when day is wildcard in featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("2024.07.*", undefined, refDate)).toBe(false);
    });

    it("should respect month even when day is wildcard in featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "2024.05.*", refDate)).toBe(false);
    });
  });

  describe("multiple wildcards", () => {
    it("should handle all wildcards in featuredFrom", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("*.*.*", undefined, refDate)).toBe(true);
    });

    it("should handle all wildcards in featuredUntil", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured(undefined, "*.*.*", refDate)).toBe(true);
    });

    it("should handle all wildcards in both parameters", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("*.*.*", "*.*.*", refDate)).toBe(true);
    });

    it("should handle year and month wildcards", () => {
      const refDate = createDate(2024, 6, 15);
      expect(isCurrentlyFeatured("*.*.01", "*.*.30", refDate)).toBe(true);
    });
  });

  describe("recurring annual events", () => {
    it("should match annual Christmas period (Dec 24 - Dec 26)", () => {
      // Christmas 2024
      expect(
        isCurrentlyFeatured("*.12.24", "*.12.26", createDate(2024, 12, 25))
      ).toBe(true);
      // Christmas 2025
      expect(
        isCurrentlyFeatured("*.12.24", "*.12.26", createDate(2025, 12, 25))
      ).toBe(true);
      // Before Christmas
      expect(
        isCurrentlyFeatured("*.12.24", "*.12.26", createDate(2024, 12, 23))
      ).toBe(false);
      // After Christmas
      expect(
        isCurrentlyFeatured("*.12.24", "*.12.26", createDate(2024, 12, 27))
      ).toBe(false);
    });

    it("should match monthly recurring day (15th of every month)", () => {
      expect(
        isCurrentlyFeatured("*.*.15", "*.*.15", createDate(2024, 1, 15))
      ).toBe(true);
      expect(
        isCurrentlyFeatured("*.*.15", "*.*.15", createDate(2024, 6, 15))
      ).toBe(true);
      expect(
        isCurrentlyFeatured("*.*.15", "*.*.15", createDate(2024, 6, 14))
      ).toBe(false);
      expect(
        isCurrentlyFeatured("*.*.15", "*.*.15", createDate(2024, 6, 16))
      ).toBe(false);
    });
  });

  describe("boundary conditions", () => {
    it("should handle year boundary (Dec 31 to Jan 1)", () => {
      const dec31 = createDate(2024, 12, 31);
      const jan1 = createDate(2025, 1, 1);

      expect(isCurrentlyFeatured("2024.12.31", "2025.01.01", dec31)).toBe(true);
      expect(isCurrentlyFeatured("2024.12.31", "2025.01.01", jan1)).toBe(true);
    });

    it("should handle month boundary (Jan 31 to Feb 1)", () => {
      const jan31 = createDate(2024, 1, 31);
      const feb1 = createDate(2024, 2, 1);

      expect(isCurrentlyFeatured("2024.01.31", "2024.02.01", jan31)).toBe(true);
      expect(isCurrentlyFeatured("2024.01.31", "2024.02.01", feb1)).toBe(true);
    });

    it("should handle first day of year", () => {
      const jan1 = createDate(2024, 1, 1);
      expect(isCurrentlyFeatured("2024.01.01", undefined, jan1)).toBe(true);
      expect(isCurrentlyFeatured(undefined, "2024.01.01", jan1)).toBe(true);
    });

    it("should handle last day of year", () => {
      const dec31 = createDate(2024, 12, 31);
      expect(isCurrentlyFeatured("2024.12.31", undefined, dec31)).toBe(true);
      expect(isCurrentlyFeatured(undefined, "2024.12.31", dec31)).toBe(true);
    });
  });

  describe("uses current date when referenceDate is not provided", () => {
    it("should use current date by default", () => {
      // This test verifies the function works without referenceDate
      // We can't test exact behavior since it depends on actual current date
      // but we can verify it doesn't throw
      expect(() => isCurrentlyFeatured("2020.01.01")).not.toThrow();
      expect(() => isCurrentlyFeatured(undefined, "2030.12.31")).not.toThrow();
    });
  });
});
