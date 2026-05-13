import type { Easing as EasingFunction } from "@carma-commons/math";

export type HexColorString = `#${string}`;

export type CesiumModelStyleOutlineConfig = {
  color?: HexColorString;
  opacity?: number;
  widthPx?: number;
};

export type CesiumModelStyleFillConfig = {
  color?: HexColorString;
};

export type CesiumModelFlashConfig = {
  color?: HexColorString;
  inDurationMs?: number;
  inEasing?: EasingFunction;
  opacity?: number;
  outDurationMs?: number;
  outEasing?: EasingFunction;
};

export type CesiumModelSelectionFlashConfig = {
  highlight?: CesiumModelFlashConfig;
  selection?: CesiumModelFlashConfig;
};

export type CesiumModelFadeConfig = {
  durationMs?: number;
  easing?: EasingFunction;
};

export type CesiumModelSelectionFadeConfig = CesiumModelFadeConfig;

export type CesiumModelHoverConfig = {
  clearDelayMs?: number;
  enabled?: boolean;
  fade?: CesiumModelFadeConfig;
};

export type CesiumModelSamplingConfig = {
  color?: HexColorString;
  enabled?: boolean;
  fade?: Pick<CesiumModelFadeConfig, "durationMs">;
  opacity?: number;
};

export type CesiumModelStyleBaseConfig = {
  fill?: CesiumModelStyleFillConfig;
};

export type CesiumModelPlainStyleConfig = CesiumModelStyleBaseConfig & {
  type: "plain";
};

export type CesiumModelSilhouetteStyleConfig = CesiumModelStyleBaseConfig & {
  outline?: CesiumModelStyleOutlineConfig;
  type: "silhouette";
};

export type CesiumModelStyleConfig =
  | CesiumModelPlainStyleConfig
  | CesiumModelSilhouetteStyleConfig;

export type CesiumModelHighlightConfig = {
  style?: CesiumModelStyleConfig;
};

export type CesiumModelSelectionConfig = {
  fade?: CesiumModelSelectionFadeConfig;
  flash?: CesiumModelSelectionFlashConfig;
  style?: CesiumModelStyleConfig;
};

export type CesiumModelConfig = {
  highlight?: CesiumModelHighlightConfig;
  hover?: CesiumModelHoverConfig;
  sampling?: CesiumModelSamplingConfig;
  selection?: CesiumModelSelectionConfig;
};
