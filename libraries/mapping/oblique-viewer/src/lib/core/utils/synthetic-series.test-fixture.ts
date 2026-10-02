import type { ObliqueDataset } from "../types";

/** Synthetic cameras and URLs for unit tests; never a production series profile. */
export const TEST_LEGACY_SERIES: ObliqueDataset = {
  id: "test-legacy",
  label: "03/2024",
  shortLabel: "2024",
  acquisitionMonth: 3,
  acquisitionYear: 2024,
  enabledByDefault: true,
  metadataFormat: "legacy-array-map",
  heightDatum: "dhhn2016",
  sourceConventions: {
    horizontalCrs: "EPSG:25832",
    verticalDatum: "dhhn2016",
    positionUnit: "m",
    rotationLayout: "row-major",
    rotationTransform: "world-to-camera",
    opticalAxis: "-z",
    pixelOrigin: "top-left",
    pixelReference: "pixel-center",
    worldAxes: ["easting", "northing", "up"],
    cameraAxes: "source-image-mm",
    pixelAxes: { x: "right", y: "down" },
  },
  cameras: Object.fromEntries(
    ["170", "171", "174", "176"].map((id, index) => [
      id,
      {
        widthPx: 1000,
        heightPx: 1000,
        focalLengthMm: 10,
        principalPointPx: [499.5, 499.5],
        halfFovTan: 0.5,
        view: ["front", "right", "back", "left"][index],
        upMapping: {
          rowIndex: index % 2 === 0 ? 0 : 1,
          negate: index === 0 || index === 3,
        },
      },
    ])
  ),
  availableCameraViews: ["front", "right", "back", "left"],
  exteriorOrientationsURI: "https://images.example/2024/catalog.json",
  crs: "EPSG:25832",
  previewPath: "https://images.example/2024",
  previewQualityLevel: "3",
  minimumPreviewQualityLevel: "1",
  hqQualityLevel: "2",
  downloadQualityLevel: "1",
  pitchDeg: 45,
  cameraHeightAboveCenter: 500,
  minFovDeg: 10,
  maxFovDeg: 100,
  enterFovDeg: 35,
  headingOffsetDeg: 0,
  cameraIdToDirection: {
    EVEN: { "170": 1, "171": 2, "174": 3, "176": 0 },
    ODD: { "170": 3, "171": 0, "174": 1, "176": 2 },
  },
  cameraIdToUpVector: {
    "170": { rowIndex: 0, negate: true },
    "171": { rowIndex: 1, negate: false },
    "174": { rowIndex: 0, negate: false },
    "176": { rowIndex: 1, negate: true },
  },
  interiorOrientationOffsets: {},
  numNearestImages: 20,
  maxDistanceMeters: 5000,
  animations: {},
  footprintsStyle: {
    outlineColor: "#fff",
    outlineWidth: 2,
    outlineOpacity: 1,
    fillOpacity: 0.02,
  },
  imagePreviewStyle: {},
};

export const TEST_INPHO_SERIES: ObliqueDataset = {
  ...TEST_LEGACY_SERIES,
  id: "test-inpho",
  label: "04/2026",
  shortLabel: "2026",
  acquisitionMonth: 4,
  acquisitionYear: 2026,
  enabledByDefault: false,
  metadataFormat: "inpho-v1",
  heightDatum: "unknown",
  sourceConventions: {
    ...TEST_LEGACY_SERIES.sourceConventions,
    verticalDatum: "unknown",
  },
  exteriorOrientationsURI: "https://images.example/2026/catalog.json",
  previewPath: "https://images.example/2026",
  availableCameraViews: ["front", "right", "back", "left", "nadir"],
};

export const TEST_SAMPLE_SERIES: ObliqueDataset = {
  ...TEST_INPHO_SERIES,
  id: "test-sample",
  label: "04/2026 (Sample)",
  shortLabel: "2026Test",
  exteriorOrientationsURI: "https://images.example/2026/sample/catalog.json",
  availableCameraViews: ["front", "right", "back", "left"],
};
