import { sandboxedEvalExternal, utils } from "@carma-appframeworks/portals";
import { FeatureInfoProperties } from "@carma/types";

const getFunctionRegex = () => {
  return /(function\s*\([^)]*\)\s*\{[^}]*\})|(\([^)]*\)\s*=>\s*[^}]*)/g;
};

export const parseColor = async (
  color: string,
  properties: FeatureInfoProperties
) => {
  if (color.startsWith("#")) {
    return color;
  } else if (getFunctionRegex().test(color)) {
    const result = await sandboxedEvalExternal("(" + color + ")", properties);
    return result.toString();
  }
  return "#0078a8";
};
