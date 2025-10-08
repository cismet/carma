import { sandboxedEvalExternal } from "@carma-appframeworks/portals";
import { FeatureInfoProperties } from "@carma/types";

// Function to get a fresh regex pattern each time to avoid lastIndex issues
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

export const parseHeader = async (
  header: string,
  properties: FeatureInfoProperties
) => {
  if (!header) return "";

  if (getFunctionRegex().test(header)) {
    try {
      const result = await sandboxedEvalExternal(
        "(" + header + ")",
        properties
      );
      return result.toString();
    } catch (error) {
      console.error("Error parsing header function:", error);
      return header;
    }
  }

  return header;
};
