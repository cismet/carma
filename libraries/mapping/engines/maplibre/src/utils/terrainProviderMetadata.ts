type StyleLike = {
  metadata?: {
    carmaConf?: {
      layerInfo?: {
        tags?: unknown;
      };
      "3d"?: unknown;
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

const asTiles3dConfig = (
  value: unknown
): Record<string, unknown> | undefined => {
  const config = value as Record<string, unknown> | undefined;
  return config?.renderMode === "tiles3d" ? config : undefined;
};

/**
 * Carry a style's tileset declaration on its layers through the style merge.
 * A style declares `carmaConf["3d"]` once at style level; only layer metadata
 * survives composition, so the block is copied onto each layer that does not
 * declare its own. Everything the tileset needs, colour calibration included,
 * comes from that declaration: there are no per-dataset presets in code.
 */
export const withTerrainProviderMetadata = (
  metadata: Record<string, unknown> | undefined,
  providesTerrain: boolean,
  styleMetadata?: Record<string, unknown>
): Record<string, unknown> => {
  const carmaConf = metadata?.carmaConf as Record<string, unknown> | undefined;
  const styleCarmaConf = styleMetadata?.carmaConf as
    | Record<string, unknown>
    | undefined;
  const tiles3dConfig =
    asTiles3dConfig(carmaConf?.["3d"]) ??
    (carmaConf?.["3d"] === undefined
      ? asTiles3dConfig(styleCarmaConf?.["3d"])
      : undefined);
  if (!tiles3dConfig) {
    return { ...metadata };
  }
  return {
    ...metadata,
    carmaConf: {
      ...carmaConf,
      "3d": {
        ...tiles3dConfig,
        ...(providesTerrain ? { providesTerrain: true } : {}),
      },
    },
  };
};
