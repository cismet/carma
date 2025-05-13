import { CarmaConfig } from "@carma-commons/types";

export const extractCarmaConfig = (
  keywords: string[] | undefined
): CarmaConfig | null => {
  let carmaConfig: CarmaConfig | null = {};
  let infoboxMapping: string[] = [];

  if (keywords) {
    keywords.forEach((keyword) => {
      if (keyword.toLowerCase().startsWith("carmaconf://")) {
        const mapping = keyword.split("carmaconf://infoBoxMapping:")[1];
        if (mapping) {
          infoboxMapping.push(mapping);
          return;
        }
        const objectString = keyword.slice(12);
        let colonIndex = objectString.indexOf(":");
        const property = objectString.split(":")[0];
        let value =
          colonIndex !== -1
            ? objectString.substring(colonIndex + 1).trim()
            : "";
        const object = { ...carmaConfig, [property]: value };
        carmaConfig = object;
      }
    });
  }

  carmaConfig = {
    ...carmaConfig,
    infoboxMapping,
  };

  return carmaConfig;
};
