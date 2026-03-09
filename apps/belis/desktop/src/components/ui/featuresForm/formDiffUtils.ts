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

const isPlainObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Get a set of changed field paths between original and draft values.
 * Recurses into nested objects (e.g. { leuchte: { field1: ... } })
 * and returns leaf-level paths like "leuchte.field1".
 */
export const getChangedPaths = (
  original: Record<string, unknown> | undefined,
  draft: Record<string, unknown> | undefined
): Set<string> => {
  const changed = new Set<string>();
  // Empty draft means no field changes (e.g. file-only draft with values: {})
  if (!draft || !original || Object.keys(draft).length === 0) return changed;

  const collect = (
    orig: Record<string, unknown>,
    dft: Record<string, unknown>,
    prefix: string
  ) => {
    const allKeys = new Set([...Object.keys(orig), ...Object.keys(dft)]);
    for (const key of allKeys) {
      const path = prefix ? `${prefix}.${key}` : key;
      const origVal = orig[key];
      const draftVal = dft[key];

      if (isPlainObj(origVal) && isPlainObj(draftVal)) {
        collect(origVal, draftVal, path);
      } else if (isPlainObj(draftVal) && !isPlainObj(origVal)) {
        // Draft has nested object but original doesn't – recurse to get leaf paths
        collect({}, draftVal, path);
      } else if (isPlainObj(origVal) && !isPlainObj(draftVal)) {
        // Original has nested object but draft doesn't – recurse to get leaf paths
        collect(origVal, {}, path);
      } else if (!isFormValueEqual(origVal, draftVal)) {
        changed.add(path);
      }
    }
  };

  collect(original, draft, "");
  return changed;
};
