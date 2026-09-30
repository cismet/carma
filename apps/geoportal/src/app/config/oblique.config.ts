import {
  WUPPERTAL_OBLIQUE_2024,
  WUPPERTAL_OBLIQUE_2026,
  WUPPERTAL_2026_RATHAUS_DATASET,
  type ObliqueViewerConfig,
} from "@carma-mapping/oblique-viewer";

/** Local demo using the published 2024 series and currently available 2026 originals. */
export const LOCAL_OBLIQUE_VIEWER_CONFIG: ObliqueViewerConfig = {
  devOriginalsBaseURI: "http://127.0.0.1:8926",
  series: [
    WUPPERTAL_OBLIQUE_2024,
    {
      ...WUPPERTAL_OBLIQUE_2026,
      label: "Schrägluftbilder 2026 (verfügbare Originale)",
      enabledByDefault: true,
      exteriorOrientationsURI:
        "http://127.0.0.1:8926/metadata/wuppertal-2026.json",
      previewPath: "http://127.0.0.1:8926",
      originalImageUrlTemplate: "http://127.0.0.1:8926/original/{imageId}.tif",
      allowUnverifiedSourceHeight: true,
    },
    WUPPERTAL_2026_RATHAUS_DATASET,
  ],
};
