import {
  SurfaceModelTypes,
  type CesiumTerrainResourceConfig,
} from "@carma/types";

export const WUPP_TERRAIN_PROVIDER: CesiumTerrainResourceConfig = {
  url: "https://cesium-wupp-terrain.cismet.de/terrain2020",
  metadata: {
    name: "Wuppertal DEM 2020",
    captureDate: "2020",
    surfaceType: SurfaceModelTypes.DEM,
  },
};

export const WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M: CesiumTerrainResourceConfig =
  {
    url: "https://cesium-wupp-terrain.cismet.de/dom_2024_1m",
    metadata: {
      name: "Wuppertal DSM 2024 (1m)",
      captureDate: "2024",
      description: "Digital Surface Model at 1 meter resolution",
      surfaceType: SurfaceModelTypes.DSM,
    },
  };
