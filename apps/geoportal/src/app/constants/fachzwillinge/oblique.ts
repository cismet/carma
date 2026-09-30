import type { FachzwillingRoute } from ".";
import { LOCAL_OBLIQUE_VIEWER_CONFIG } from "../../config/oblique.config";

export const obliqueFachzwilling: FachzwillingRoute = {
  path: "oblique",
  hideFromCatalog: true,
  title: "Schrägluftbilder",
  availability: {
    deployments: ["localDev"],
  },
  defaultLayers: [
    { styleUrl: "https://tiles.cismet.de/lod2/mesh2024.style.json" },
  ],
  addons: [
    "mapStyle3d",
    {
      addon: "obliqueViewer",
      config: {
        ...LOCAL_OBLIQUE_VIEWER_CONFIG,
        storageKey: "carma.geoportal.oblique.viewer",
        startEnabled: true,
      },
    },
  ],
};
