export type AnnotationLineStyleOptions = {
  strokeWidthPx?: number;
  overlayDashPattern?: string;
};

export type ResolvedAnnotationLineStyleOptions = {
  strokeWidthPx: number;
  overlayDashPattern: string;
};

export const ANNOTATION_LINE_STYLE_DEFAULTS =
  Object.freeze<ResolvedAnnotationLineStyleOptions>({
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
});
