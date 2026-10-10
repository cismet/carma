import { Easing } from "@carma-commons/math";
import type { StyleSpecification } from "maplibre-gl";
import type { DeploymentTarget } from "@carma-commons/utils";
import { WUPP_LOD2_TILESET, WUPP_MESH_2024 } from "@carma-commons/resources";

import type { ObliqueViewerConfig } from "@carma-mapping/oblique-viewer";

/** The oblique addon is available behind its flag on development deployments. */
export const OBLIQUE_VIEWER_DEPLOYMENTS: DeploymentTarget[] = [
  "localDev",
  "dev",
  "pr",
];

const publicAssetUrl = (path: string, baseUrl: string) =>
  `${baseUrl.replace(/\/?$/, "/")}${path.replace(/^\/+/, "")}`;

/** Series, camera calibration and image metadata remain on the imagery server. */
export const resolveObliqueViewerConfig = (
  _baseUrl: string = import.meta.env.BASE_URL
): ObliqueViewerConfig => ({
  seriesConfigURI: "https://wupp-oblique.cismet.de/series-config-ecef-v2.json",
  seriesOverrides: {
    "wuppertal-2024": {
      preferredAvifPyramidTemplate:
        "https://wupp-oblique.cismet.de/2024/image/{imageId}.avif",
    },
    "wuppertal-2026": {
      preferredAvifPyramidTemplate:
        "https://wupp-oblique.cismet.de/2026/image/{imageId}.avif",
    },
  },
  // Match the established Cesium interaction profile in oblique/config.ts.
  animations: {
    enterObliqueMode: {
      duration: 2000,
      easingFunction: Easing.EXPONENTIAL_IN_OUT,
    },
    flyToExteriorOrientation: {
      duration: 800,
      easingFunction: Easing.QUADRATIC_IN,
    },
    flyToNextImage: {
      delay: 0,
      duration: 100,
      easingFunction: Easing.LINEAR_NONE,
    },
    flyToRotatedImage: { duration: 1800, easingFunction: Easing.CUBIC_IN_OUT },
    rotateCamera: { duration: 1800, easingFunction: Easing.CUBIC_IN_OUT },
    leaveObliqueMode: { duration: 1100, easingFunction: Easing.CUBIC_IN_OUT },
  },
});

export const OBLIQUE_VIEWER_CONFIG = resolveObliqueViewerConfig();

/** Public style stays the sole authored parity profile; load it asynchronously. */
export const OBLIQUE_MESH_2024_STYLE_URI = publicAssetUrl(
  "data/mesh2024-cesium-parity.style.json",
  import.meta.env.BASE_URL
);

export const OBLIQUE_LOD2_STYLE: StyleSpecification = {
  version: 8,
  metadata: {
    carmaConf: {
      "3d": {
        renderMode: "tiles3d",
        tilesetUrl: WUPP_LOD2_TILESET.url,
        providesTerrain: false,
      },
    },
  },
  sources: {},
  layers: [
    {
      id: "oblique-lod2",
      type: "background",
      paint: { "background-opacity": 0 },
    },
  ],
};

export const OBLIQUE_BASE_TILESET_URLS = [
  WUPP_MESH_2024.url,
  ...WUPP_MESH_2024.alternateUrls,
  WUPP_LOD2_TILESET.url,
];
