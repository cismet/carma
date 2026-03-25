import dayjs from "dayjs";

export const DAYJS_PREFIX = "__dayjs:";

export const serializeValues = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (dayjs.isDayjs(value)) {
      // Normalize to date-only (YYYY-MM-DD) so local-time vs UTC differences
      // from DatePicker don't cause false-positive dirty detection.
      result[key] = DAYJS_PREFIX + value.format("YYYY-MM-DD");
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = serializeValues(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
};

export const deserializeValues = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.startsWith(DAYJS_PREFIX)) {
      result[key] = dayjs(value.slice(DAYJS_PREFIX.length));
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      // Handle corrupted dayjs objects from old persist data (have $d property)
      if ("$d" in obj) {
        result[key] = dayjs(obj["$d"] as string);
      } else {
        result[key] = deserializeValues(obj);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
};
