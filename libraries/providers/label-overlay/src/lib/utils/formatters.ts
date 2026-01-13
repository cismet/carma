const ENCLOSED_GLYPHS =
  "⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿";

/**
 * Formats a number into an enclosed (circled) string.
 *
 * This function uses single Unicode glyphs for integers from 0 to 50.
 * For numbers outside this range, it falls back to a digit-by-digit
 * conversion (e.g., 51 becomes '⑤①'). The input number is rounded to the
 * nearest integer.
 *
 * @param {number} num The number to format.
 * @returns {string} The formatted string with enclosed characters.
 *
 * @example
 * formatNumberToEnclosed(7);   // '⑦'
 * formatNumberToEnclosed(25);  // '㉕'
 * formatNumberToEnclosed(50);  // '㊿'
 * formatNumberToEnclosed(51);  // '⑤①'
 * formatNumberToEnclosed(123); // '①②③'
 * formatNumberToEnclosed(-10); // '-①⓪'
 * formatNumberToEnclosed(19.8); // '⑳' (rounds to 20)
 */
export const formatNumberToEnclosed = (num: number): string => {
  const roundedNum = Math.round(num);

  // Case 1: The number is within the single-glyph range (0-50).
  // We can directly index into the string.
  if (roundedNum >= 0 && roundedNum < ENCLOSED_GLYPHS.length) {
    return ENCLOSED_GLYPHS[roundedNum];
  }

  // Case 2: Fallback for numbers > 50 or negative numbers.
  // We convert each digit using the same lookup string.
  return roundedNum
    .toString()
    .split("")
    .map((char) => ENCLOSED_GLYPHS[Number(char)] || char)
    .join("");
};

/**
 * Formats a distance value to a human-readable string.
 * Shows meters for distances < 1000m, kilometers otherwise.
 */
export const formatDistance = (distanceMeters: number): string => {
  if (Math.abs(distanceMeters) < 1000) {
    return `${distanceMeters.toFixed(2)}m`;
  }
  return `${(distanceMeters / 1000).toFixed(3)}km`;
};

/**
 * Creates a point label text with elevation delta and optional cumulative distance.
 */
export const createPointLabelText = (
  pointGeographic: { height: number },
  pointIndex: number,
  cumulativeDistance: number,
  isSingleSegment: boolean,
  referenceElevation: number
): string => {
  const elevationDelta = pointGeographic.height - referenceElevation;
  const elevationFmt = `Δh${formatDistance(elevationDelta)}`;

  return pointIndex === 0 || isSingleSegment
    ? elevationFmt
    : `${formatDistance(cumulativeDistance)} ${elevationFmt}`;
};
