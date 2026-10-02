import { Easing } from "@carma-commons/math";
import {
  OBLIQUE_2024_EXT_ORI_UTM32_URI,
  OBLIQUE_2024_PREVIEW_PATH,
} from "@carma-commons/resources";
import { CardinalDirectionClockwise } from "@carma-geo/data-structures";
import type { Positions } from "@carma-mapping/map-controls-layout";

import { calibrationFromMetadata } from "./utils/calibration";
import { FOOTPRINT_SELECTION_COLOR, PREVIEW_QUALITY } from "./constants";
import type {
  InteriorOrientationOffset,
  ObliqueBackdropLook,
  ObliqueDataset,
  ObliqueHeightDatum,
  ObliqueCameraCalibration,
  ObliqueMetadataConventions,
} from "./types";

/**
 * What a route declares to mount the viewer. Everything about the flight is
 * data in the dataset; a route that just wants the Wuppertal 2024 flight
 * declares the bare kind.
 */
export type ObliqueViewerConfig = Partial<ObliqueDataset> & {
  /** Start the viewer and its panel when the host mounts this addon. */
  startEnabled?: boolean;
  /** Independently selectable image series; omitted uses the two Wuppertal presets. */
  series?: readonly ObliqueDataset[];
  /**
   * Whether the control column gets a button toggling the viewer. Default:
   * true; the row in the layer bar is the addon's face while it runs, the
   * button is how it is started.
   */
  showControl?: boolean;
  /** Corner the button is registered in. Default: "topleft" */
  controlPosition?: Positions;
  /** Sort order within that corner. Default: 82 */
  controlOrder?: number;
  /**
   * `localStorage` entry the viewer's state is kept in across reloads.
   * Default: one entry shared by every route (`OBLIQUE_STATE_STORAGE_KEY`).
   */
  storageKey?: string;
  /**
   * Which frame the exterior orientations' z counts from. "dhhn2016" uses it
   * as served against the terrain; "ellipsoidal" converts it first. Default:
   * "dhhn2016".
   */
  heightDatum?: ObliqueHeightDatum;
  /** metres added to every camera altitude, for fine tuning. Default: 0 */
  heightOffset?: number;
};

/** the MapLibre terrain source the viewer switches on while it runs */
export const DEFAULT_CONTROL_POSITION: Positions = "topleft";
/** geoportal's topleft column: terrain 80, flood 83, time series 85 */
export const DEFAULT_CONTROL_ORDER = 82;

/**
 * tan of the half field of view along the sensor's long edge: the preview's
 * long edge in pixels is twice the focal length in pixels times this. The
 * value was tuned against the map rather than computed from the calibration
 * (which gives 0.2458); keep it.
 */
export const PREVIEW_IMAGE_BASE_SCALE_FACTOR = 0.2462;

export const BACKDROP_LOOK_DEFAULT: ObliqueBackdropLook = {
  brightness: 125,
  contrast: 95,
  saturation: 85,
};

export const BACKDROP_LOOK_BOUNDS: Record<
  keyof ObliqueBackdropLook,
  [min: number, max: number]
> = {
  brightness: [50, 150],
  contrast: [50, 150],
  saturation: [0, 200],
};

const CAMERA_ID_TO_DIRECTION = {
  // even flight lines
  EVEN: {
    "170": CardinalDirectionClockwise.East,
    "171": CardinalDirectionClockwise.South,
    "174": CardinalDirectionClockwise.West,
    "176": CardinalDirectionClockwise.North,
  },
  // odd flight lines, flown the other way
  ODD: {
    "170": CardinalDirectionClockwise.West,
    "171": CardinalDirectionClockwise.North,
    "174": CardinalDirectionClockwise.East,
    "176": CardinalDirectionClockwise.South,
  },
} as const;

// Row 2 is the optical axis, so it can never be the image's up: the
// landscape cameras (forward, rear) take it from row 0, the portrait ones
// (right, left) from row 1, each signed so the far side is on top.
const CAMERA_ID_TO_UP_VECTOR = {
  "170": { rowIndex: 0, negate: true }, // forward
  "171": { rowIndex: 1, negate: false }, // right
  "174": { rowIndex: 0, negate: false }, // rear
  "176": { rowIndex: 1, negate: true }, // left
} as const;

type InteriorOrientation = {
  principalPointX: number;
  principalPointY: number;
  columns: number;
  rows: number;
};

/**
 * From the camera calibration in the flight's project file: principal point
 * and sensor size per camera. iXM-RS150F, 3.76 µm pixels, ~110 mm lenses.
 */
const INTERIOR_ORIENTATIONS: Record<string, InteriorOrientation> = {
  "170": {
    principalPointX: 7102.5638,
    principalPointY: 5313,
    columns: 14204,
    rows: 10652,
  },
  "171": {
    principalPointX: 5347.5745,
    principalPointY: 7078.0957,
    columns: 10652,
    rows: 14204,
  },
  "174": {
    principalPointX: 7120.6489,
    principalPointY: 5336.9362,
    columns: 14204,
    rows: 10652,
  },
  "176": {
    principalPointX: 5351.5638,
    principalPointY: 7099.9043,
    columns: 10652,
    rows: 14204,
  },
};

/** how far the principal point sits from the sensor centre, in unit space */
const offsetFromInteriorOrientation = ({
  principalPointX,
  principalPointY,
  columns,
  rows,
}: InteriorOrientation): InteriorOrientationOffset => ({
  xOffset: 0.5 - principalPointX / columns,
  yOffset: 0.5 - principalPointY / rows,
});

const INTERIOR_ORIENTATION_OFFSETS = Object.fromEntries(
  Object.entries(INTERIOR_ORIENTATIONS).map(([id, intOri]) => [
    id,
    offsetFromInteriorOrientation(intOri),
  ])
) as Record<string, InteriorOrientationOffset>;

/** the Wuppertal 2024 flight, as the Cesium viewer had it configured */
const SOURCE_CONVENTIONS: ObliqueMetadataConventions = {
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
};

const LEGACY_FOCAL_LENGTHS: Record<string, number> = {
  "170": 108.644,
  "171": 108.723,
  "174": 108.632,
  "176": 108.74,
};

const CAMERAS_2024: Record<string, ObliqueCameraCalibration> =
  Object.fromEntries(
    Object.entries(INTERIOR_ORIENTATIONS).map(([id, camera]) => [
      id,
      {
        widthPx: camera.columns,
        heightPx: camera.rows,
        focalLengthMm: LEGACY_FOCAL_LENGTHS[id],
        principalPointPx: [camera.principalPointX, camera.principalPointY],
        halfFovTan: PREVIEW_IMAGE_BASE_SCALE_FACTOR,
        upMapping:
          CAMERA_ID_TO_UP_VECTOR[id as keyof typeof CAMERA_ID_TO_UP_VECTOR],
        view: (
          {
            "170": "front",
            "171": "right",
            "174": "back",
            "176": "left",
          } as Record<string, string>
        )[id],
      },
    ])
  );

export const WUPPERTAL_OBLIQUE_2024: ObliqueDataset = {
  id: "wuppertal-2024",
  label: "03/2024",
  shortLabel: "2024",
  acquisitionMonth: 3,
  acquisitionYear: 2024,
  enabledByDefault: true,
  metadataFormat: "legacy-array-map",
  heightDatum: "dhhn2016",
  sourceConventions: SOURCE_CONVENTIONS,
  cameras: CAMERAS_2024,
  availableCameraViews: ["front", "right", "back", "left"],
  exteriorOrientationsURI: OBLIQUE_2024_EXT_ORI_UTM32_URI,
  footprintsURI: undefined,
  crs: "EPSG:25832",
  previewPath: OBLIQUE_2024_PREVIEW_PATH,
  allowUnverifiedSourceHeight: false,
  previewQualityLevel: PREVIEW_QUALITY.LEVEL_3,
  minimumPreviewQualityLevel: PREVIEW_QUALITY.LEVEL_1,
  hqQualityLevel: PREVIEW_QUALITY.LEVEL_2,
  downloadQualityLevel: PREVIEW_QUALITY.LEVEL_1,
  pitchDeg: 45,
  cameraHeightAboveCenter: 700,
  minFovDeg: 10,
  maxFovDeg: 110,
  enterFovDeg: 34,
  headingOffsetDeg: -34.3,
  cameraIdToDirection: CAMERA_ID_TO_DIRECTION,
  cameraIdToUpVector: CAMERA_ID_TO_UP_VECTOR,
  interiorOrientationOffsets: INTERIOR_ORIENTATION_OFFSETS,
  numNearestImages: 200,
  maxDistanceMeters: 5000,
  animations: {
    enterObliqueMode: {
      duration: 450,
      easingFunction: Easing.CUBIC_IN_OUT,
    },
    flyToExteriorOrientation: {
      duration: 450,
      easingFunction: Easing.CUBIC_IN_OUT,
    },
    flyToNextImage: {
      delay: 0,
      duration: 100,
      easingFunction: Easing.LINEAR_NONE,
    },
    flyToRotatedImage: {
      duration: 350,
      easingFunction: Easing.CUBIC_IN_OUT,
    },
    rotateCamera: {
      duration: 300,
      easingFunction: Easing.CUBIC_IN_OUT,
    },
    leaveObliqueMode: {
      duration: 450,
      easingFunction: Easing.CUBIC_IN_OUT,
    },
    outlineFadeOut: {
      delay: 0,
      duration: 150,
      easingFunction: Easing.QUADRATIC_IN_OUT,
    },
  },
  footprintsStyle: {
    outlineColor: FOOTPRINT_SELECTION_COLOR,
    outlineWidth: 8,
    outlineOpacity: 0.85,
    fillOpacity: 0.08,
    inactiveOpacity: 0.2,
  },
  imagePreviewStyle: {
    backdropColor: "rgba(0, 0, 0, 0.13)",
    border: "2px solid rgba(255, 255, 255, 0.9)",
    boxShadow: "0 0 50px rgba(255, 255, 255, 0.8)",
  },
};

/** the config keys that describe the viewer rather than the flight */
const VIEWER_ONLY_KEYS = new Set<string>([
  "startEnabled",
  "series",
  "showControl",
  "controlPosition",
  "controlOrder",
  "storageKey",
  "heightDatum",
  "heightOffset",
]);

/** the dataset a config describes: the preset with the config's fields on top */
export const resolveDataset = (
  config: ObliqueViewerConfig | undefined
): ObliqueDataset => {
  if (!config) return WUPPERTAL_OBLIQUE_2024;
  const dataset = Object.fromEntries(
    Object.entries(config).filter(([key]) => !VIEWER_ONLY_KEYS.has(key))
  ) as Partial<ObliqueDataset>;
  return {
    ...WUPPERTAL_OBLIQUE_2024,
    ...dataset,
    shortLabel:
      dataset.shortLabel ??
      (!dataset.id || dataset.id === WUPPERTAL_OBLIQUE_2024.id
        ? "2024"
        : undefined),
    acquisitionMonth:
      dataset.acquisitionMonth ??
      (!dataset.id || dataset.id === WUPPERTAL_OBLIQUE_2024.id ? 3 : undefined),
    acquisitionYear:
      dataset.acquisitionYear ??
      (!dataset.id || dataset.id === WUPPERTAL_OBLIQUE_2024.id
        ? 2024
        : undefined),
    animations: {
      ...WUPPERTAL_OBLIQUE_2024.animations,
      ...(dataset.animations ?? {}),
    },
    footprintsStyle: {
      ...WUPPERTAL_OBLIQUE_2024.footprintsStyle,
      ...(dataset.footprintsStyle ?? {}),
    },
    imagePreviewStyle: {
      ...WUPPERTAL_OBLIQUE_2024.imagePreviewStyle,
      ...(dataset.imagePreviewStyle ?? {}),
    },
  };
};

/** Calibrations retained from the delivered Osprey 4.2 INPHO camera definitions. */
const CAMERAS_2026: Record<string, ObliqueCameraCalibration> =
  Object.fromEntries(
    ["LE", "FW", "BW", "NA", "RI"].map((view) => {
      const id = `O42_434S024481410408_skyup_${view}`;
      const portrait = view === "LE" || view === "RI";
      const nadir = view === "NA";
      const widthPx = nadir ? 25024 : portrait ? 12736 : 19136;
      const heightPx = nadir ? 19008 : portrait ? 19136 : 12736;
      const cx = nadir ? 12511.5 : portrait ? 6367.5 : 9567.5;
      const cy = nadir ? 9503.5 : portrait ? 6364.653 : 6367.5;
      return [
        id,
        calibrationFromMetadata({
          widthPx,
          heightPx,
          focalLengthMm: nadir ? 80 : 124,
          imageMmToPixelAffine: [
            [355.871886121, 0, cx],
            [0, -355.871886121, cy],
          ],
          mountRotationDeg: 270,
          sourceId: id,
          view: (
            {
              LE: "left",
              RI: "right",
              FW: "front",
              BW: "back",
              NA: "nadir",
            } as Record<string, string>
          )[view],
        }),
      ];
    })
  );

/** Metadata-only target. Its future image pyramid is not claimed to exist. */
export const WUPPERTAL_OBLIQUE_2026: ObliqueDataset = {
  ...WUPPERTAL_OBLIQUE_2024,
  id: "wuppertal-2026",
  label: "04/2026",
  shortLabel: "2026",
  // Delivered Aufnahmeorte.shp timestamps (ATTR_6): 2026-04-11 for every point.
  acquisitionMonth: 4,
  acquisitionYear: 2026,
  enabledByDefault: false,
  metadataFormat: "inpho-v1",
  heightDatum: "unknown",
  sourceConventions: { ...SOURCE_CONVENTIONS, verticalDatum: "unknown" },
  exteriorOrientationsURI:
    "https://wupp-oblique.cismet.de/2026/metadata/orientation.json",
  footprintsURI: undefined,
  previewPath: "https://wupp-oblique.cismet.de/2026",
  downloadPath: undefined,
  originalImageUrlTemplate: undefined,
  allowUnverifiedSourceHeight: false,
  headingOffsetDeg: 0,
  cameras: CAMERAS_2026,
  availableCameraViews: ["front", "right", "back", "left", "nadir"],
  cameraIdToDirection: { EVEN: {}, ODD: {} },
  cameraIdToUpVector: Object.fromEntries(
    Object.entries(CAMERAS_2026).map(([id, camera]) => [id, camera.upMapping])
  ),
  interiorOrientationOffsets: Object.fromEntries(
    Object.entries(CAMERAS_2026).map(([id, camera]) => [
      id,
      {
        xOffset: 0.5 - camera.principalPointPx[0] / camera.widthPx,
        yOffset: 0.5 - camera.principalPointPx[1] / camera.heightPx,
      },
    ])
  ),
};

/** Independently selectable 41-image sample from the same 2026 delivery. */
export const WUPPERTAL_2026_RATHAUS_DATASET: ObliqueDataset = {
  ...WUPPERTAL_OBLIQUE_2026,
  id: "wuppertal-2026-rathaus",
  label: "04/2026 (Sample)",
  shortLabel: "2026Test",
  availableCameraViews: ["left", "right", "front", "back"],
  enabledByDefault: false,
  exteriorOrientationsURI: "/oblique/2026-rathaus/metadata.json",
  previewPath: "/oblique/2026-rathaus",
};

export const resolveSeries = (
  config: ObliqueViewerConfig | undefined
): ObliqueDataset[] => {
  const series = config?.series ?? [
    resolveDataset(config),
    WUPPERTAL_OBLIQUE_2026,
    WUPPERTAL_2026_RATHAUS_DATASET,
  ];
  const ids = new Set<string>();
  return series.map((dataset) => {
    if (!dataset.id || ids.has(dataset.id))
      throw new Error("Image series IDs must be nonempty and unique.");
    ids.add(dataset.id);
    return dataset;
  });
};
