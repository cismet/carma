import { sandboxedEvalExternal } from "@carma-commons/sandbox-eval";
import { FeatureInfoProperties } from "@carma/types";
import { utils } from "@carma-appframeworks/portals";

export const parseColor = async (
  color: string,
  properties: FeatureInfoProperties
) => {
  if (color.startsWith("#")) {
    return color;
  } else if (utils.getFunctionRegex().test(color)) {
    const result = await sandboxedEvalExternal("(" + color + ")", properties);
    return result.toString();
  }
  return "#0078a8";
};
