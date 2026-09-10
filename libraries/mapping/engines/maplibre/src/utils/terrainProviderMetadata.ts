import { WUPP_MESH_2024 } from "@carma-commons/resources";

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
        // Prefer catalog-authored metadata; the local resource supplies the
        // established calibration until the remote style publishes it.
        ...(tiles3dConfig.colorCorrection != null
          ? { colorCorrection: tiles3dConfig.colorCorrection }
          : tiles3dConfig.tilesetUrl === WUPP_MESH_2024.url ||
            (typeof tiles3dConfig.tilesetUrl === "string" &&
              WUPP_MESH_2024.alternateUrls.includes(tiles3dConfig.tilesetUrl))
          ? { colorCorrection: WUPP_MESH_2024.colorCorrection }
          : {}),
      },
    },
  };
};
