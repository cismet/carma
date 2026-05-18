import { CarmaConfig } from "@carma-mapping/layers";

export const extractCarmaConfig = (
  keywords: string[] | undefined
): CarmaConfig | null => {
  let carmaConfig: CarmaConfig | null = {};
  let infoboxMapping: string[] = [];

  if (keywords) {
    keywords.forEach((keyword) => {
      if (keyword.toLowerCase().startsWith("carmaconf://")) {
        // handle infoBoxMapping
        if (keyword.toLowerCase().startsWith("carmaconf://infoboxmapping:")) {
          const mapping = keyword.split("carmaconf://infoBoxMapping:")[1];
          if (mapping) {
            infoboxMapping.push(mapping);
            return;
          }
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

  if (infoboxMapping.length > 0) {
    carmaConfig = {
      ...carmaConfig,
      infoboxMapping,
    };
  }

  return carmaConfig;
};

export const resolveLayerTitle = (layer: {
  title?: string;
  vectorTitle?: string;
  keywords?: string[];
}): string | undefined => {
  const carmaConf = extractCarmaConfig(layer.keywords);
  return layer.vectorTitle || (carmaConf?.vectorTitle as string) || layer.title;
};

export const resolveLayerDescription = (layer: {
  description?: string;
  vectorDescription?: string;
  keywords?: string[];
}): string | undefined => {
  const carmaConf = extractCarmaConfig(layer.keywords);
  return (
    layer.vectorDescription ||
    (carmaConf?.vectorDescription as string) ||
    layer.description
  );
};
