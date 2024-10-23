import type { CarmaConfObject } from "../types";

export const extractCarmaConf = (
  keywords: string[] | undefined,
): CarmaConfObject | null => {
  let carmaConf: CarmaConfObject | null = null;

  if (keywords) {
    keywords.forEach((keyword) => {
      if (keyword.toLowerCase().startsWith("carmaconf://")) {
        const objectString = keyword.slice(12);
        let colonIndex = objectString.indexOf(":");
        const property = objectString.split(":")[0];
        let value =
          colonIndex !== -1
            ? objectString.substring(colonIndex + 1).trim()
            : "";
        const object = { ...carmaConf, [property]: value };
        carmaConf = object;
      }
    });
  }

  return carmaConf;
};
