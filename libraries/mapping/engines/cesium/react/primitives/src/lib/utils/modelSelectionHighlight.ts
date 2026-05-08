import { Easing, type Easing as EasingFunction } from "@carma-commons/math";
import { Color, Model, type CustomShader } from "@carma-cesium";

import {
  clampModelHighlightEdgeOpacity,
  clampModelHighlightOpacity,
  DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_WIDTH_PX,
  normalizeModelHighlightEdgeWidthPx,
} from "./modelHighlightShader";

const MODEL_SELECTION_HIGHLIGHT_EDGE_MODE_PROPERTY =
  "modelSelectionHighlightEdgeMode";

export type ModelSelectionHighlightEdgeMode = "silhouette" | "none";

export type ModelSelectionHighlightState = {
  animationDurationMs: number;
  animationEasing: EasingFunction;
  animationStartOpacity: number;
  animationStartTimestampMs: number | null;
  flashStartTimestampMs: number | null;
  isFlashActive: boolean;
  originalOutlineColor: Color;
  originalShowOutline: boolean;
  originalHighlightColor?: Color;
  originalHighlightOpacity?: number;
  originalShader: CustomShader | undefined;
  originalSilhouetteColor: Color;
  originalSilhouetteSize: number;
  opacity: number;
  shader: CustomShader;
  targetOpacity: number;
  usesIntegratedShader: boolean;
};

export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_DURATION_MS = 220;
export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_EASING = Easing.CUBIC_OUT;
export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_FLASH_DURATION_MS = 160;
export const DEFAULT_MODEL_SELECTION_HIGHLIGHT_FLASH_OPACITY = 1;
export const DEFAULT_MODEL_SELECTION_HOVER_CLEAR_DELAY_MS = 40;
export const MODEL_SELECTION_FLASH_HIGHLIGHT_COLOR = new Color(1, 1, 1, 1);

const MODEL_SELECTION_SILHOUETTE_SIZE_FADE_EXPONENT = 1.5;

export const normalizeModelSelectionHighlightFadeDuration = (
  fadeDurationMs: number | undefined
) =>
  typeof fadeDurationMs === "number" &&
  Number.isFinite(fadeDurationMs) &&
  fadeDurationMs >= 0
    ? fadeDurationMs
    : DEFAULT_MODEL_SELECTION_HIGHLIGHT_FADE_DURATION_MS;

export const normalizeModelSelectionFlashDuration = (
  durationMs: number | undefined
) =>
  typeof durationMs === "number" &&
  Number.isFinite(durationMs) &&
  durationMs >= 0
    ? durationMs
    : DEFAULT_MODEL_SELECTION_HIGHLIGHT_FLASH_DURATION_MS;

export const normalizeModelSelectionHoverClearDelay = (
  clearDelayMs: number | undefined
) =>
  typeof clearDelayMs === "number" &&
  Number.isFinite(clearDelayMs) &&
  clearDelayMs >= 0
    ? clearDelayMs
    : DEFAULT_MODEL_SELECTION_HOVER_CLEAR_DELAY_MS;

export const interpolateNumber = (from: number, to: number, progress: number) =>
  from + (to - from) * progress;

export const clampEasedProgress = (progress: number) =>
  Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 1;

export const interpolateColor = (from: Color, to: Color, progress: number) =>
  new Color(
    from.red + (to.red - from.red) * progress,
    from.green + (to.green - from.green) * progress,
    from.blue + (to.blue - from.blue) * progress,
    from.alpha + (to.alpha - from.alpha) * progress
  );

export const createNonAccumulatingSilhouetteColor = (
  edgeColor: Color,
  edgeOpacity: number
) => {
  const strength =
    edgeColor.alpha * clampModelHighlightEdgeOpacity(edgeOpacity);

  return new Color(
    1 + (edgeColor.red - 1) * strength,
    1 + (edgeColor.green - 1) * strength,
    1 + (edgeColor.blue - 1) * strength,
    1
  );
};

export const calculateTaperedSilhouetteSize = (
  edgeWidthPx: number,
  highlightOpacity: number
) =>
  normalizeModelHighlightEdgeWidthPx(
    edgeWidthPx,
    DEFAULT_MODEL_SELECTION_HIGHLIGHT_EDGE_WIDTH_PX
  ) *
  Math.pow(
    clampModelHighlightOpacity(highlightOpacity, 0),
    MODEL_SELECTION_SILHOUETTE_SIZE_FADE_EXPONENT
  );

export const readPrimitiveHighlightEdgeMode = (
  primitive: Model,
  fallback: ModelSelectionHighlightEdgeMode
): ModelSelectionHighlightEdgeMode => {
  const pickId = primitive.id as
    | { properties?: Record<string, unknown> }
    | undefined;
  const configuredMode =
    pickId?.properties?.[MODEL_SELECTION_HIGHLIGHT_EDGE_MODE_PROPERTY];
  return configuredMode === "silhouette" || configuredMode === "none"
    ? configuredMode
    : fallback;
};
