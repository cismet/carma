
export type CarmaConfig = Record<string, string>;

export const extractCarmaConfig = (
    keywords: string[] | undefined,
  ): CarmaConfig | null => {
    let carmaConfig: CarmaConfig | null = null;
  
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
          const object = { ...carmaConfig, [property]: value };
          carmaConfig = object;
        }
      });
    }
  
    return carmaConfig;
  };
  