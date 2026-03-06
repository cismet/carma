import dayjs from "dayjs";

/**
 * Normalize a value for comparison purposes.
 * Treats null, undefined, and empty string as equivalent.
 */
const normalizeValue = (value: unknown): unknown => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return value;
};

/**
 * Deep comparison of two form values.
 * Handles dayjs objects, nested objects, arrays, and treats
 * null/undefined/empty-string as equivalent.
 */
export const isFormValueEqual = (a: unknown, b: unknown): boolean => {
  const normA = normalizeValue(a);
  const normB = normalizeValue(b);

  // Both are null/undefined/empty
  if (normA === null && normB === null) return true;
  if (normA === null || normB === null) return false;

  // dayjs comparison
  if (dayjs.isDayjs(normA) && dayjs.isDayjs(normB)) {
    return normA.valueOf() === normB.valueOf();
  }
  if (dayjs.isDayjs(normA) || dayjs.isDayjs(normB)) return false;

  // Primitive comparison
  if (typeof normA !== "object" || typeof normB !== "object") {
    return normA === normB;
  }

  // Array comparison
  if (Array.isArray(normA) && Array.isArray(normB)) {
    if (normA.length !== normB.length) return false;
    return normA.every((item, index) => isFormValueEqual(item, normB[index]));
  }
  if (Array.isArray(normA) || Array.isArray(normB)) return false;

  // Object comparison
  const objA = normA as Record<string, unknown>;
  const objB = normB as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(objA), ...Object.keys(objB)]);

  for (const key of allKeys) {
    if (!isFormValueEqual(objA[key], objB[key])) return false;
  }

  return true;
};

/**
 * Check if draft values differ from original values.
 * Returns true if there are actual changes.
 */
export const isFormDirty = (
  originalValues: Record<string, unknown> | undefined,
  draftValues: Record<string, unknown> | undefined
): boolean => {
  if (!draftValues) return false;
  if (!originalValues) return !!draftValues;
  return !isFormValueEqual(originalValues, draftValues);
};
