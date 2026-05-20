import dayjs from "dayjs";

export const DAYJS_PREFIX = "__dayjs:";

// Serialize a single value. Recurses into both plain objects and arrays so
// dayjs values nested anywhere (e.g. inside the `leuchten` extra-tabs array)
// are tagged with DAYJS_PREFIX. Without this, redux-persist's JSON.stringify
// would collapse a raw dayjs into a bare ISO string via its toJSON(), and the
// reload could no longer tell it apart from a plain string field.
const serializeValue = (value: unknown): unknown => {
  if (dayjs.isDayjs(value)) {
    // Normalize to date-only (YYYY-MM-DD) so local-time vs UTC differences
    // from DatePicker don't cause false-positive dirty detection.
    return DAYJS_PREFIX + value.format("YYYY-MM-DD");
  }
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (value && typeof value === "object") {
    return serializeValues(value as Record<string, unknown>);
  }
  return value;
};

export const serializeValues = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    result[key] = serializeValue(value);
  }
  return result;
};

const deserializeValue = (value: unknown): unknown => {
  if (typeof value === "string" && value.startsWith(DAYJS_PREFIX)) {
    return dayjs(value.slice(DAYJS_PREFIX.length));
  }
  if (Array.isArray(value)) {
    return value.map(deserializeValue);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Handle corrupted dayjs objects from old persist data (have $d property)
    if ("$d" in obj) {
      return dayjs(obj["$d"] as string);
    }
    return deserializeValues(obj);
  }
  return value;
};

export const deserializeValues = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    result[key] = deserializeValue(value);
  }
  return result;
};
