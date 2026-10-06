import type { FachzwillingRoute } from ".";
import {
  OBLIQUE_VIEWER_CONFIG,
  OBLIQUE_VIEWER_DEPLOYMENTS,
} from "../../config/oblique.config";

export const obliqueFachzwilling: FachzwillingRoute = {
  path: "oblique",
  hideFromCatalog: true,
  title: "Schrägluftbilder",
  availability: {
    deployments: OBLIQUE_VIEWER_DEPLOYMENTS,
  },
  // Oblique owns its mesh/LoD2 basis while running; it is not a saved extra layer.
  addons: [
    {
      addon: "mapStyle3d",
      availability: { featureFlag: "featureFlagMapStyle3d" },
      config: { vectorBaseMap: true },
    },
    {
      addon: "obliqueViewer",
      availability: { featureFlag: "featureFlagObliqueViewerAddon" },
      config: {
        ...OBLIQUE_VIEWER_CONFIG,
        storageKey: "carma.geoportal.oblique.viewer",
        startEnabled: true,
      },
    },
    {
      addon: "obliqueObjectViews",
      availability: { featureFlag: "featureFlagObliqueNextUi" },
    },
  ],
};
