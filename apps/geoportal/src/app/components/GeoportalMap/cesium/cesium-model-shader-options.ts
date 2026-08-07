import { Color } from "@carma-cesium";
import type {
  CesiumModelConfig,
  CesiumModelFlashConfig,
  CesiumModelStyleConfig,
} from "@carma-mapping/engines/cesium/core";
import type { AdhocCesiumModelShaderOptions } from "@carma-appframeworks/portals";

import { CESIUM_CONFIG } from "../../../config/app.config";

const HEX_COLOR_WITHOUT_ALPHA_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const colorFromHexWithoutAlpha = (
  hexColor: string | undefined
): Color | undefined => {
  if (!hexColor || !HEX_COLOR_WITHOUT_ALPHA_PATTERN.test(hexColor)) {
    return undefined;
  }
  const color = Color.fromCssColorString(hexColor);
  return color ? new Color(color.red, color.green, color.blue, 1) : undefined;
};

const readModelStyleOutline = (style: CesiumModelStyleConfig | undefined) =>
  style?.type === "silhouette" ? style.outline : undefined;

const buildModelShaderFlashOptions = (
  flash: CesiumModelFlashConfig | undefined
) => ({
  color: colorFromHexWithoutAlpha(flash?.color),
  inDurationMs: flash?.inDurationMs,
  inEasing: flash?.inEasing,
  opacity: flash?.opacity,
  outDurationMs: flash?.outDurationMs,
  outEasing: flash?.outEasing,
});

const buildAdhocModelShaderOptions = (
  config: CesiumModelConfig | undefined
): AdhocCesiumModelShaderOptions => {
  const hover = config?.hover;
  const sampling = config?.sampling;
  const selection = config?.selection;
  const selectionStyle = selection?.style;
  const selectionOutline = readModelStyleOutline(selectionStyle);

  return {
    sampling: {
      color: colorFromHexWithoutAlpha(sampling?.color),
      enabled: sampling?.enabled,
      fade: sampling?.fade,
      opacity: sampling?.opacity,
    },
    selection: {
      fade: selection?.fade,
      flash: {
        selection: buildModelShaderFlashOptions(selection?.flash?.selection),
        highlight: buildModelShaderFlashOptions(selection?.flash?.highlight),
      },
      hover: {
        clearDelayMs: hover?.clearDelayMs,
        enabled: hover?.enabled,
        fade: hover?.fade,
      },
      style: {
        edge: {
          color: colorFromHexWithoutAlpha(selectionOutline?.color),
          mode: selectionStyle?.type === "plain" ? "none" : "silhouette",
          opacity: selectionOutline?.opacity,
          widthPx: selectionOutline?.widthPx,
        },
        fillColor: colorFromHexWithoutAlpha(selectionStyle?.fill?.color),
      },
    },
  };
};

export const MODEL_CONFIG = CESIUM_CONFIG.model;
export const MODEL_SHADER_OPTIONS = buildAdhocModelShaderOptions(MODEL_CONFIG);
