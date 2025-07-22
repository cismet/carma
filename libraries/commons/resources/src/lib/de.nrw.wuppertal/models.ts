import { ModelConfig } from "../loaders/model";

export const BRUECKENENTWURF_GLB: ModelConfig = {
  position: {
    //longitude: 7.12157,
    //latitude: 51.25275,
    //altitude: 247.5,
    longitude: 7.12125,
    latitude: 51.252,
    altitude: 236,
  },

  orientation: {
    heading: 93.6,
  },
  model: {
    scale: 0.85,
    uri: "https://wupp-3d-data.cismet.de/mesh2024/assets/bridge.glb",
  },
  name: "Hängebrücke (Entwurf)",
  description: "Hängebrücke BUGA 2031 Entwurf",
};
