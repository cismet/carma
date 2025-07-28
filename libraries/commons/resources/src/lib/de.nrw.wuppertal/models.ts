import { ModelConfig } from "../loaders/model";

export const BRUECKENENTWURF_GLB: ModelConfig = {
  position: {
    longitude: 7.121277,
    latitude: 51.252545,
    altitude: 245.4,
  },

  orientation: {
    heading: 95.45,
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
