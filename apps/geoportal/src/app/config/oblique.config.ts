import type { StyleSpecification } from "maplibre-gl";
import { resolveDeployment, type DeploymentTarget } from "@carma-commons/utils";
import { WUPP_LOD2_TILESET, WUPP_MESH_2024 } from "@carma-commons/resources";

import {
  WUPPERTAL_OBLIQUE_2024,
  WUPPERTAL_OBLIQUE_2026,
  WUPPERTAL_2026_RATHAUS_DATASET,
  type ObliqueViewerConfig,
} from "@carma-mapping/oblique-viewer";

/** The oblique addon is available behind its flag on development deployments. */
export const OBLIQUE_VIEWER_DEPLOYMENTS: DeploymentTarget[] = [
  "localDev",
  "dev",
  "pr",
];

const publicAssetUrl = (path: string, baseUrl: string) =>
  `${baseUrl.replace(/\/?$/, "/")}${path.replace(/^\/+/, "")}`;

/** Local demo using 2024 and the complete, optimistically addressable 2026 catalog. */
export const LOCAL_OBLIQUE_VIEWER_CONFIG: ObliqueViewerConfig = {
  devOriginalsBaseURI: "http://127.0.0.1:8926",
  series: [
    WUPPERTAL_OBLIQUE_2024,
    {
      ...WUPPERTAL_OBLIQUE_2026,
      enabledByDefault: true,
      exteriorOrientationsURI:
        "http://127.0.0.1:8926/metadata/wuppertal-2026.json",
      previewPath: "http://127.0.0.1:8926",
      originalImageUrlTemplate: "http://127.0.0.1:8926/original/{imageId}.tif",
      originalPixelPreviewPath: "http://127.0.0.1:8926/rgb",
      allowUnverifiedSourceHeight: true,
    },
    WUPPERTAL_2026_RATHAUS_DATASET,
  ],
};

/** Published previews use public imagery; the TIFF bridge belongs to localhost. */
export const resolveObliqueViewerConfig = (
  deployment: DeploymentTarget | null = resolveDeployment(),
  baseUrl: string = import.meta.env.BASE_URL
): ObliqueViewerConfig =>
  deployment === "localDev"
    ? LOCAL_OBLIQUE_VIEWER_CONFIG
    : {
        series: [
          WUPPERTAL_OBLIQUE_2024,
          { ...WUPPERTAL_OBLIQUE_2026, enabledByDefault: false },
          {
            ...WUPPERTAL_2026_RATHAUS_DATASET,
            enabledByDefault: false,
            exteriorOrientationsURI: publicAssetUrl(
              "oblique/2026-rathaus/metadata.json",
              baseUrl
            ),
            previewPath: publicAssetUrl("oblique/2026-rathaus", baseUrl),
          },
        ],
      };

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
  WUPP_LOD2_TILESET.url,
];
