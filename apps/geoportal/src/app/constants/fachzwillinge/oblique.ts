import type { FachzwillingRoute } from ".";
import { LOCAL_OBLIQUE_VIEWER_CONFIG } from "../../config/oblique.config";

export const obliqueFachzwilling: FachzwillingRoute = {
  path: "oblique",
  hideFromCatalog: true,
  title: "Schrägluftbilder",
  availability: {
    deployments: ["localDev"],
  },
  // Oblique owns its mesh/LoD2 basis while running; it is not a saved extra layer.
  addons: [
    { addon: "mapStyle3d", config: { vectorBaseMap: true } },
    {
      addon: "obliqueViewer",
      availability: { featureFlag: "featureFlagObliqueViewerAddon" },
      config: {
        ...LOCAL_OBLIQUE_VIEWER_CONFIG,
        storageKey: "carma.geoportal.oblique.viewer",
        startEnabled: true,
      },
    },
  ],
};
