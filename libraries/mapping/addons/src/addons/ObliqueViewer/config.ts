import { Easing } from "@carma-commons/math";
import {
  OBLIQUE_2024_EXT_ORI_UTM32_URI,
  OBLIQUE_2024_FPRFC_GEOJSON_URI,
  OBLIQUE_2024_PREVIEW_PATH,
} from "@carma-commons/resources";
import { CardinalDirectionClockwise } from "@carma-geo/data-structures";
import type { Positions } from "@carma-mapping/map-controls-layout";

import { PREVIEW_QUALITY } from "./constants";
import type {
  InteriorOrientationOffset,
  ObliqueBackdropLook,
  ObliqueDataset,
  ObliqueHeightDatum,
} from "./types";

/**
 * What a route declares to mount the viewer. Everything about the flight is
 * data in the dataset; a route that just wants the Wuppertal 2024 flight
 * declares the bare kind.
 */
export type ObliqueViewerConfig = Partial<ObliqueDataset> & {
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

const CAMERA_ID_TO_UP_VECTOR = {
  "170": { rowIndex: 2, negate: true }, // forward
  "171": { rowIndex: 1, negate: false }, // right
  "174": { rowIndex: 2, negate: true }, // rear
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
  "170": { principalPointX: 7102.5638, principalPointY: 5313, columns: 14204, rows: 10652 },
  "171": { principalPointX: 5347.5745, principalPointY: 7078.0957, columns: 10652, rows: 14204 },
  "174": { principalPointX: 7120.6489, principalPointY: 5336.9362, columns: 14204, rows: 10652 },
  "176": { principalPointX: 5351.5638, principalPointY: 7099.9043, columns: 10652, rows: 14204 },
};

/** how far the principal point sits from the sensor centre, in unit space */
const offsetFromInteriorOrientation = ({
  principalPointX,
  principalPointY,
  columns,
  rows,
}: InteriorOrientation): InteriorOrientationOffset => ({
  xOffset: 1 - principalPointX / (columns * 0.5),
  yOffset: 1 - principalPointY / (rows * 0.5),
});

const INTERIOR_ORIENTATION_OFFSETS = Object.fromEntries(
  Object.entries(INTERIOR_ORIENTATIONS).map(([id, intOri]) => [
    id,
    offsetFromInteriorOrientation(intOri),
  ])
) as Record<string, InteriorOrientationOffset>;

/** the Wuppertal 2024 flight, as the Cesium viewer had it configured */
export const WUPPERTAL_OBLIQUE_2024: ObliqueDataset = {
  exteriorOrientationsURI: OBLIQUE_2024_EXT_ORI_UTM32_URI,
  footprintsURI: OBLIQUE_2024_FPRFC_GEOJSON_URI,
  crs: "EPSG:25832",
  previewPath: OBLIQUE_2024_PREVIEW_PATH,
  previewQualityLevel: PREVIEW_QUALITY.LEVEL_3,
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
    flyToRotatedImage: {
      duration: 1800,
      easingFunction: Easing.CUBIC_IN_OUT,
    },
    rotateCamera: {
      duration: 1000,
      easingFunction: Easing.CUBIC_IN_OUT,
    },
    leaveObliqueMode: {
      duration: 1100,
      easingFunction: Easing.CUBIC_IN_OUT,
    },
    outlineFadeOut: {
      delay: 500,
      duration: 300,
      easingFunction: Easing.QUADRATIC_IN_OUT,
    },
  },
  footprintsStyle: {
    outlineColor: "#ffffff",
    outlineWidth: 8,
    outlineOpacity: 0.85,
  },
  imagePreviewStyle: {
    backdropColor: "rgba(0, 0, 0, 0.13)",
    border: "2px solid rgba(255, 255, 255, 0.9)",
    boxShadow: "0 0 50px rgba(255, 255, 255, 0.8)",
  },
};

/** the dataset a config describes: the preset with the config's fields on top */
export const resolveDataset = (
  config: Partial<ObliqueDataset> | undefined
): ObliqueDataset => {
  if (!config) return WUPPERTAL_OBLIQUE_2024;
  const {
    showControl: _showControl,
    controlPosition: _controlPosition,
    controlOrder: _controlOrder,
    storageKey: _storageKey,
    heightDatum: _heightDatum,
    heightOffset: _heightOffset,
    ...dataset
  } = config as ObliqueViewerConfig;
  return {
    ...WUPPERTAL_OBLIQUE_2024,
    ...dataset,
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
