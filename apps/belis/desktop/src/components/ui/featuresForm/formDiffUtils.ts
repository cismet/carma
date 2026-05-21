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

// A dayjs instance is technically a non-array object, but it must be treated
// as a leaf value — never recursed into. Without the dayjs guard, getChangedPaths
// would descend into a date's internals ($D/$M/$y/…) and record those instead
// of the field path itself, so the field never gets the changed/gray highlight.
const isPlainObj = (v: unknown): v is Record<string, unknown> =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  !dayjs.isDayjs(v);

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

const isEmpty = (v: unknown) =>
  v === null || v === undefined || v === "";

const walkPath = (
  obj: Record<string, unknown> | undefined,
  path: string
): unknown => {
  if (!obj) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (!isPlainObj(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
};

/**
 * Get the set of allowlisted ("tracked") paths that should render with the
 * green highlight.
 *
 * A tracked field is green when no default has been remembered yet (e.g. the
 * very first draft of a feature type) or when its value still equals the
 * remembered default. Once a non-empty default exists, any draft whose value
 * diverges from it — including one that left the field empty — loses the
 * green highlight and renders gray via the changed-fields path.
 */
export const getPrefilledPaths = (
  draft: Record<string, unknown> | undefined,
  allowlistedPaths?: Set<string>,
  currentDefaults?: Record<string, unknown>
): Set<string> => {
  const matched = new Set<string>();
  if (!allowlistedPaths || allowlistedPaths.size === 0) {
    return matched;
  }
  for (const path of allowlistedPaths) {
    const draftVal = walkPath(draft, path);
    const defaultVal = walkPath(currentDefaults, path);
    // No default remembered yet → the field is green by default (the very
    // first draft of a feature type, before any value has been recorded).
    if (isEmpty(defaultVal)) {
      matched.add(path);
      continue;
    }
    // A non-empty default exists: green only while this draft's value still
    // matches it. Anything else — a diverged value *or an empty field* —
    // falls through to the gray "changed" highlight.
    if (isFormValueEqual(draftVal, defaultVal)) {
      matched.add(path);
    }
  }
  return matched;
};
