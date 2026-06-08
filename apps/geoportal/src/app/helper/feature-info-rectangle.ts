import {
  FEATURE_INFO_RECTANGLE_CONFIG,
  type FeatureInfoRectangleConfig,
} from "../config/app.config";

// Per-layer override of the implicit feature-info rectangle, encoded in the
// layer's `carmaConf://pointInfo:<pixelsize>[,<upperleftX>,<upperleftY>]`
// keyword
export const resolveFeatureInfoRectangleConfig = (
  pointInfoValue: unknown
): FeatureInfoRectangleConfig => {
  if (typeof pointInfoValue !== "string" || pointInfoValue.trim() === "") {
    return FEATURE_INFO_RECTANGLE_CONFIG;
  }

  const parts = pointInfoValue.split(",").map((part) => Number(part.trim()));

  if (parts.some((part) => Number.isNaN(part))) {
    console.warn(
      `[GEOPORTAL][pointInfo] Ignoring unparsable rectangle config "${pointInfoValue}", falling back to default.`
    );
    return FEATURE_INFO_RECTANGLE_CONFIG;
  }

  const [pixelsize, upperleftX, upperleftY] = parts;

  return {
    pixelsize: pixelsize ?? FEATURE_INFO_RECTANGLE_CONFIG.pixelsize,
    upperleftX: upperleftX ?? FEATURE_INFO_RECTANGLE_CONFIG.upperleftX,
    upperleftY: upperleftY ?? FEATURE_INFO_RECTANGLE_CONFIG.upperleftY,
  };
};
