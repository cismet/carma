// TODO: Update to use ModelResourceConfig from resources
// import type { ModelConfig } from "@carma-mapping/engines/cesium/core";

// Temporarily commented out to break circular dependency
// These should be converted to ModelResourceConfig

export const BRUECKENENTWURF_GLB: ModelConfig = {
  position: {
    longitude: 7.121277 as any,
    latitude: 51.252545 as any,
    altitude: 245.4 as any,
  },

  orientation: {
    heading: 95.45 as any,
  },
  model: {
    uri: "https://wupp-3d-data.cismet.de/mesh2024/assets/bridge.glb",
  },
  name: "Hängebrücke (Entwurf Stand Juli 2025)",
  properties: {
    header: "3D-Modell",
    title: "Hängebrücke (Entwurf Stand Juli 2025)",
    url: "https://www.wuppertal.de/bebauungsplaene#bundesgartenschau-2031-buga-seilbahn-und-haengebruecke",
  },
};
