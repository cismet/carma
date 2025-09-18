import { sandboxedEvalExternal } from "@carma-appframeworks/portals";
import { FeatureInfoProperties } from "@carma/types";

export const parseColor = async (
  color: string,
  properties: FeatureInfoProperties
) => {
  const functionRegex =
    /(function\s*\([^)]*\)\s*\{[^}]*\})|(\([^)]*\)\s*=>\s*[^}]*)/g;
  if (color.startsWith("#")) {
    return color;
  } else if (functionRegex.test(color)) {
    const result = await sandboxedEvalExternal("(" + color + ")", properties);
    return result.toString();
  }
  return "#0078a8";
};
