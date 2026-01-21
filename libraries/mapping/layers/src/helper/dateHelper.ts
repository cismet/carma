/**
 * Parses a date string in the format "YYYY.MM.DD" where "*" can be used as a wildcard.
 * @param dateStr - Date string in format "YYYY.MM.DD"
 * @returns Parsed date object with year, month, day (null if wildcard) or null if invalid
 */
export const parseDate = (dateStr: string) => {
  const parts = dateStr.split(".");
  if (parts.length !== 3) return null;

  const [y, m, d] = parts;
  return {
    year: y === "*" ? null : parseInt(y, 10),
    month: m === "*" ? null : parseInt(m, 10),
    day: d === "*" ? null : parseInt(d, 10),
  };
};

/**
 * Checks if the current date falls within a featured date range.
 * Supports wildcard dates using "*" for year, month, or day components.
 *
 * Date format: "YYYY.MM.DD" where each component can be "*" to indicate any value.
 * Examples:
 * - "2024.12.25" - December 25, 2024
 * - "*.12.25" - December 25 of any year
 * - "2024.*.15" - The 15th of any month in 2024
 *
 * @param featuredFrom - Start date string (optional)
 * @param featuredUntil - End date string (optional)
 * @param referenceDate - Date to check against (defaults to current date)
 * @returns true if the reference date is within the featured range
 */
export const isCurrentlyFeatured = (
  featuredFrom?: string,
  featuredUntil?: string,
  referenceDate?: Date
): boolean => {
  if (!featuredFrom && !featuredUntil) {
    return false;
  }

  const today = referenceDate ?? new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();

  let featured = true;

  if (featuredFrom) {
    const parsed = parseDate(featuredFrom);
    if (!parsed) return false;
    const { year: yFrom, month: mFrom, day: dFrom } = parsed;

    // Check year: if specified and in the future, not featured yet
    if (yFrom !== null && yFrom > y) {
      featured = false;
    } else if (yFrom !== null && yFrom < y) {
      // Year is in the past, featuredFrom condition is satisfied
    } else {
      // Year matches or is wildcard - check month
      if (mFrom !== null && mFrom > m) {
        featured = false;
      } else if (mFrom !== null && mFrom < m) {
        // Month is in the past, featuredFrom condition is satisfied
      } else {
        // Month matches or is wildcard - check day
        if (dFrom !== null && dFrom > d) {
          featured = false;
        }
      }
    }
  }

  if (featured && featuredUntil) {
    const parsed = parseDate(featuredUntil);
    if (!parsed) return false;
    const { year: yUntil, month: mUntil, day: dUntil } = parsed;

    // Check year: if specified and in the past, no longer featured
    if (yUntil !== null && yUntil < y) {
      featured = false;
    } else if (yUntil !== null && yUntil > y) {
      // Year is in the future, featuredUntil condition is satisfied
    } else {
      // Year matches or is wildcard - check month
      if (mUntil !== null && mUntil < m) {
        featured = false;
      } else if (mUntil !== null && mUntil > m) {
        // Month is in the future, featuredUntil condition is satisfied
      } else {
        // Month matches or is wildcard - check day
        if (dUntil !== null && dUntil < d) {
          featured = false;
        }
      }
    }
  }

  return featured;
};
