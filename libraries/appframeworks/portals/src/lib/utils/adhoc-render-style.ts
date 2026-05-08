export type AdhocUnselectedRenderStyle = "default" | "highlight";

export type AdhocUnselectedRenderStyleMetadata = {
  unselectedRenderStyleEditing?: boolean;
  unselectedRenderStyle?: AdhocUnselectedRenderStyle;
  unselectedRenderTintColor?: string;
  unselectedRenderTintMix?: number;
};

export const DEFAULT_ADHOC_UNSELECTED_RENDER_STYLE: AdhocUnselectedRenderStyle =
  "default";
export const DEFAULT_ADHOC_UNSELECTED_RENDER_TINT_COLOR = "#facc15";
export const MIN_ADHOC_UNSELECTED_RENDER_TINT_MIX = 0.2;
export const DEFAULT_ADHOC_UNSELECTED_RENDER_TINT_MIX = 0.55;

export const ADHOC_UNSELECTED_RENDER_STYLES: AdhocUnselectedRenderStyle[] = [
  "default",
  "highlight",
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const isAdhocUnselectedRenderStyle = (
  value: unknown
): value is AdhocUnselectedRenderStyle =>
  ADHOC_UNSELECTED_RENDER_STYLES.includes(value as AdhocUnselectedRenderStyle);

export const resolveAdhocUnselectedRenderStyle = (
  value: unknown
): AdhocUnselectedRenderStyle => {
  if (isAdhocUnselectedRenderStyle(value)) {
    return value;
  }
  if (
    value === "tint" ||
    value === "flat-tint" ||
    value === "monochrome-tint"
  ) {
    return "highlight";
  }
  return DEFAULT_ADHOC_UNSELECTED_RENDER_STYLE;
};

export const resolveAdhocUnselectedRenderTintColor = (
  value: unknown
): string => {
  if (typeof value !== "string") {
    return DEFAULT_ADHOC_UNSELECTED_RENDER_TINT_COLOR;
  }
  const normalized = value.trim();
  return HEX_COLOR_PATTERN.test(normalized)
    ? normalized
    : DEFAULT_ADHOC_UNSELECTED_RENDER_TINT_COLOR;
};

export const resolveAdhocUnselectedRenderTintMix = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_ADHOC_UNSELECTED_RENDER_TINT_MIX;
  }
  return Math.min(1, Math.max(MIN_ADHOC_UNSELECTED_RENDER_TINT_MIX, value));
};
