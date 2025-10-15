import { TerrainModelTypes, TerrainProviderConfig } from "@carma/types";

export const WUPP_TERRAIN_PROVIDER: TerrainProviderConfig = {
  url: "https://cesium-wupp-terrain.cismet.de/terrain2020",
  key: "terrain2020",
  modelType: TerrainModelTypes.DEM,
};

export const WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M = {
  url: "https://cesium-wupp-terrain.cismet.de/dom_2024_1m",
  key: "dom_2024_1m",
  modelType: TerrainModelTypes.DSM,
};
