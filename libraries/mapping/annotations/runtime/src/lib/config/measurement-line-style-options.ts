export type MeasurementLineStyleOptions = {
  strokeWidthPx?: number;
  overlayDashPattern?: string;
};

export type ResolvedMeasurementLineStyleOptions = {
  strokeWidthPx: number;
  overlayDashPattern: string;
};

export const MEASUREMENT_LINE_STYLE_DEFAULTS =
  Object.freeze<ResolvedMeasurementLineStyleOptions>({
    strokeWidthPx: 1.5,
    overlayDashPattern: "8 8",
  });

const resolvePositiveFiniteNumber = (
  value: number | undefined,
  fallback: number
) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;

const resolveNonEmptyString = (value: string | undefined, fallback: string) => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : fallback;
};

export const resolveMeasurementLineStyleOptions = (
  options?: MeasurementLineStyleOptions,
  defaults: ResolvedMeasurementLineStyleOptions = MEASUREMENT_LINE_STYLE_DEFAULTS
): ResolvedMeasurementLineStyleOptions => ({
  strokeWidthPx: resolvePositiveFiniteNumber(
    options?.strokeWidthPx,
    defaults.strokeWidthPx
  ),
  overlayDashPattern: resolveNonEmptyString(
    options?.overlayDashPattern,
    defaults.overlayDashPattern
  ),
});
