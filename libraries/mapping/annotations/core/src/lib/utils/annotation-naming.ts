const LEGACY_DEFAULT_POINT_NAME_PATTERN = /^Messpunkt\s+\d+$/i;
const PLACEHOLDER_WITH_INDEX_PATTERN = /^Punkt(?:e)?messung\s+#\d+$/i;

export const DEFAULT_POINT_MEASUREMENT_PLACEHOLDER = "Punktmessung";

export const normalizeMeasurementName = (name?: string): string =>
  (name ?? "").trim();

export const isDefaultPointMeasurementName = (name?: string): boolean => {
  const normalizedName = normalizeMeasurementName(name);

  return (
    normalizedName.length === 0 ||
    normalizedName.toLowerCase() ===
      DEFAULT_POINT_MEASUREMENT_PLACEHOLDER.toLowerCase() ||
    PLACEHOLDER_WITH_INDEX_PATTERN.test(normalizedName) ||
    LEGACY_DEFAULT_POINT_NAME_PATTERN.test(normalizedName)
  );
};

export const getCustomPointAnnotationName = (name?: string): string | null => {
  const normalizedName = normalizeMeasurementName(name);
  return isDefaultPointMeasurementName(normalizedName) ? null : normalizedName;
};
