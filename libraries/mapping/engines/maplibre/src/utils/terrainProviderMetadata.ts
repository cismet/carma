type StyleLike = {
  metadata?: {
    carmaConf?: {
      layerInfo?: {
        tags?: unknown;
      };
    };
  };
};

export const styleProvidesTerrain = (style: StyleLike): boolean => {
  const tags = style.metadata?.carmaConf?.layerInfo?.tags;
  return (
    Array.isArray(tags) &&
    tags.some(
      (tag: unknown) => typeof tag === "string" && tag.toLowerCase() === "mesh"
    )
  );
};

export const withTerrainProviderMetadata = (
  metadata: Record<string, unknown> | undefined,
  providesTerrain: boolean
): Record<string, unknown> => {
  const carmaConf = metadata?.carmaConf as Record<string, unknown> | undefined;
  const tiles3dConfig = carmaConf?.["3d"] as
    | Record<string, unknown>
    | undefined;

  if (!providesTerrain || tiles3dConfig?.renderMode !== "tiles3d") {
    return { ...metadata };
  }

  return {
    ...metadata,
    carmaConf: {
      ...carmaConf,
      "3d": {
        ...tiles3dConfig,
        providesTerrain: true,
      },
    },
  };
};
