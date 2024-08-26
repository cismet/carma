import type { VectorObject } from "../types";

export const extractVectorStyles = (
  keywords: string[],
): VectorObject | null => {
  let vectorObject: VectorObject | null = null;

  if (keywords) {
    keywords.forEach((keyword) => {
      if (keyword.startsWith("carmaConf://")) {
        const objectString = keyword.slice(12);
        let colonIndex = objectString.indexOf(":");
        const property = objectString.split(":")[0];
        let value =
          colonIndex !== -1
            ? objectString.substring(colonIndex + 1).trim()
            : "";
        const object = { [property]: value };
        vectorObject = object;
      }
    });
  }

  return vectorObject;
};
