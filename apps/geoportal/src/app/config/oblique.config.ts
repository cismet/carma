import type { StyleSpecification } from "maplibre-gl";
import { WUPP_LOD2_TILESET, WUPP_MESH_2024 } from "@carma-commons/resources";

import {
  WUPPERTAL_OBLIQUE_2024,
  WUPPERTAL_OBLIQUE_2026,
  WUPPERTAL_2026_RATHAUS_DATASET,
  type ObliqueViewerConfig,
} from "@carma-mapping/oblique-viewer";

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

/** Public style stays the sole authored parity profile; load it asynchronously. */
export const OBLIQUE_MESH_2024_STYLE_URI =
  "/data/mesh2024-cesium-parity.style.json";

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
