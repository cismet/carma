/**
 * When distance and polyline measurements carry their meter markers (the
 * ruler dots, on engines that draw them): always, only while drafted or
 * selected, or never.
 */
export const ANNOTATION_METER_MARKER_MODES = {
  ALWAYS: "always",
  SELECTED: "selected",
  OFF: "off",
} as const;

export type AnnotationMeterMarkerMode =
  (typeof ANNOTATION_METER_MARKER_MODES)[keyof typeof ANNOTATION_METER_MARKER_MODES];

export type AnnotationLineStyleOptions = {
  strokeWidthPx?: number;
  overlayDashPattern?: string;
  meterMarkers?: AnnotationMeterMarkerMode;
};

export type ResolvedAnnotationLineStyleOptions = {
  strokeWidthPx: number;
  overlayDashPattern: string;
  meterMarkers: AnnotationMeterMarkerMode;
};

export const ANNOTATION_LINE_STYLE_DEFAULTS =
  Object.freeze<ResolvedAnnotationLineStyleOptions>({
    strokeWidthPx: 1.5,
    overlayDashPattern: "8 8",
    meterMarkers: ANNOTATION_METER_MARKER_MODES.ALWAYS,
  });

/** Whether a committed line shows its meter markers in this mode. */
export const showsAnnotationMeterMarkers = (
  mode: AnnotationMeterMarkerMode,
  selected: boolean
): boolean =>
  mode === ANNOTATION_METER_MARKER_MODES.ALWAYS ||
  (mode === ANNOTATION_METER_MARKER_MODES.SELECTED && selected);

/** Whether a drafted line shows its meter markers in this mode. */
export const showsDraftAnnotationMeterMarkers = (
  mode: AnnotationMeterMarkerMode
): boolean => mode !== ANNOTATION_METER_MARKER_MODES.OFF;

const isMeterMarkerMode = (
  value: unknown
): value is AnnotationMeterMarkerMode =>
  Object.values(ANNOTATION_METER_MARKER_MODES).includes(
    value as AnnotationMeterMarkerMode
  );

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

export const resolveAnnotationLineStyleOptions = (
  options?: AnnotationLineStyleOptions,
  defaults: ResolvedAnnotationLineStyleOptions = ANNOTATION_LINE_STYLE_DEFAULTS
): ResolvedAnnotationLineStyleOptions => ({
  strokeWidthPx: resolvePositiveFiniteNumber(
    options?.strokeWidthPx,
    defaults.strokeWidthPx
  ),
  overlayDashPattern: resolveNonEmptyString(
    options?.overlayDashPattern,
    defaults.overlayDashPattern
  ),
  meterMarkers: isMeterMarkerMode(options?.meterMarkers)
    ? options.meterMarkers
    : defaults.meterMarkers,
});
