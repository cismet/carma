import type { CarmaConfig } from "@carma/types";

export const extractCarmaConfig = (
  keywords: string[] | undefined
): CarmaConfig => {
  const carmaConfig: Partial<CarmaConfig> = {};
  const infoboxMapping: string[] = [];

  if (keywords) {
    keywords.forEach((keyword) => {
      if (keyword.toLowerCase().startsWith("carmaconf://")) {
        const mapping = keyword.split("carmaconf://infoBoxMapping:")[1];
        if (mapping) {
          infoboxMapping.push(mapping);
          return;
        }
        const objectString = keyword.slice(12);
        const colonIndex = objectString.indexOf(":");
        const property = objectString.split(":")[0] as keyof CarmaConfig;
        const value =
          colonIndex !== -1
            ? objectString.substring(colonIndex + 1).trim()
            : "";
        carmaConfig[property] = value as any;
      }
    });
  }

  if (infoboxMapping.length > 0) {
    return {
      ...carmaConfig,
      infoboxMapping,
    };
  }

  return carmaConfig;
};
