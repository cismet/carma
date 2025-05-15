import { Math as CesiumMath, Color, EasingFunction } from "cesium";
import {
  OBLIQUE_2024_ORIENTATIONS_CRS,
  OBLIQUE_2024_PREVIEW_PATH,
  OBLIQUE_2024_EXT_ORI_UTM32_URI,
  OBLIQUE_2024_FPRFC_GEOJSON_URI,
} from "@carma-commons/resources";
import { OBLIQUE_PREVIEW_QUALITY } from "./constants";
import { ObliqueDataProviderConfig } from "./types";
import { CardinalDirectionEnum } from "./utils/orientationUtils";

export const OBLIQUE_CONFIG: ObliqueDataProviderConfig = {
  fixedPitch: CesiumMath.toRadians(-45), // Pitch in radians
  fixedHeight: 900, // Height in meters
  minFov: CesiumMath.toRadians(10), // Minimum field of view in radians
  maxFov: CesiumMath.toRadians(120), // Maximum field of view in radians
  headingOffset: CesiumMath.toRadians(-34.3), // Heading offset in radians
  previewQualityLevel: OBLIQUE_PREVIEW_QUALITY.LEVEL_3,
  previewPath: OBLIQUE_2024_PREVIEW_PATH,
  crs: OBLIQUE_2024_ORIENTATIONS_CRS,
  exteriorOrientationsURI: OBLIQUE_2024_EXT_ORI_UTM32_URI,
  footprintsURI: OBLIQUE_2024_FPRFC_GEOJSON_URI,
  animations: {
    flyToExteriorOrientation: {
      duration: 800,
      easingFunction: EasingFunction.QUADRATIC_IN,
    },
    outlineFadeOut: {
      delay: 500,
      duration: 300,
      easingFunction: EasingFunction.QUADRATIC_IN_OUT,
    },
  },
  footprintsStyle: {
    outlineColor: Color.WHITE,
    outlineWidth: 8,
    outlineOpacity: 0.85,
  },
  imagePreviewStyle: {
    backdropColor: "rgba(0, 0, 0, 0.13)",
  },
};

export const NUM_NEAREST_IMAGES = 200;

export const CAMERA_ID_TO_DIRECTION = Object.freeze({
  // For even flight lines
  EVEN: {
    "170": CardinalDirectionEnum.East,
    "171": CardinalDirectionEnum.South,
    "174": CardinalDirectionEnum.West,
    "176": CardinalDirectionEnum.North,
  },
  // For odd flight lines
  ODD: {
    "170": CardinalDirectionEnum.West,
    "171": CardinalDirectionEnum.North,
    "174": CardinalDirectionEnum.East,
    "176": CardinalDirectionEnum.South,
  },
});

export const CAMERA_ID_TO_UP_VECTOR_MATRIX_MAPPING = Object.freeze({
  "170": { rowIndex: 2, negate: true }, // forward
  "171": { rowIndex: 1, negate: false }, // right
  "174": { rowIndex: 2, negate: true }, // rear
  "176": { rowIndex: 1, negate: true }, // left
});

type InteriorOrientationCalibrationData = {
  principalPointX: number;
  principalPointY: number;
  columns: number; // sensor width in pixels
  rows: number; // sensor height in pixels
  focalLength: number; // nominally 110mm
  ppmm: number; // pixels per mm ; equals 1/ Pixel size 3.76µm
  label?: string; // label for the camera
  model: SensorSpecs; // camera model
  CCD_INTERIOR_ORIENTATION: [
    [number, number, number],
    [number, number, number]
  ]; // CCD interior orientation matrix as is from CAMERA_DEFINTION
};

type SensorSpecs = {
  name: string; // camera model
  columns: number; // sensor width in pixels
  rows: number; // sensor height in pixels
  ppmm: number; // pixels per mm ; equals 1/ Pixel size 3.76µm
};

const SENSOR_SPECS: Record<string, SensorSpecs> = Object.freeze({
  // iXM-RS150F Camera or older
  // parameters manually extracted from the camera calibration data in the prj file
  // https://www.phaseone.com/wp-content/uploads/2024/01/iXM-RS150F_Fact-Sheet_Display_EN_2023.pdf

  RS150: {
    name: "iXM-RS150F Camera",
    columns: 14204,
    rows: 10652,
    ppmm: 265.9574468085,
  },
});

export const NADIR_CAMERA_ID = "NAD";

const INTERIOR_ORIENTATIONS: Record<
  string,
  InteriorOrientationCalibrationData
> = Object.freeze({
  // parameters manually extracted from the camera calibration data in the prj file
  "170": {
    label: "front",
    model: SENSOR_SPECS.RS150,
    principalPointX: 7102.5638,
    principalPointY: 5313,
    columns: 14204,
    rows: 10652,
    focalLength: 108.644,
    ppmm: 265.9574468085,
    CCD_INTERIOR_ORIENTATION: [
      [0, -265.9574468085, 7102.5638],
      [-265.9574468085, 0, 5313],
    ],
  },
  "171": {
    label: "right",
    model: SENSOR_SPECS.RS150,
    principalPointX: 5347.5745,
    principalPointY: 7078.0957,
    columns: 10652,
    rows: 14204,
    focalLength: 108.723,
    ppmm: 265.9574468085,
    CCD_INTERIOR_ORIENTATION: [
      [-265.9574468085, 0, 5347.5745],
      [0, 265.9574468085, 7078.0957],
    ],
  },
  "174": {
    label: "back",
    model: SENSOR_SPECS.RS150,
    principalPointX: 7120.6489,
    principalPointY: 5336.9362,
    columns: 14204,
    rows: 10652,
    focalLength: 108.632,
    ppmm: 265.9574468085,
    CCD_INTERIOR_ORIENTATION: [
      [0, 265.9574468085, 7120.6489],
      [265.9574468085, 0, 5336.9362],
    ],
  },
  "176": {
    label: "left",
    model: SENSOR_SPECS.RS150,
    principalPointX: 5351.5638,
    principalPointY: 7099.9043,
    columns: 10652,
    rows: 14204,
    focalLength: 108.74,
    ppmm: 265.9574468085,
    CCD_INTERIOR_ORIENTATION: [
      [265.9574468085, 0, 5351.5638],
      [0, -265.9574468085, 7099.9043],
    ],
  },
});

const getOffsetFromIntOri = ({
  principalPointX,
  principalPointY,
  columns,
  rows,
}: {
  principalPointX: number;
  principalPointY: number;
  columns: number;
  rows: number;
}) => {
  // calculate the relative offset of the images in unit space
  const xOffset = 1 - principalPointX / (columns * 0.5);
  const yOffset = 1 - principalPointY / (rows * 0.5);
  return { xOffset, yOffset };
};

export const CAMERA_ID_INTERIOR_ORIENTATION_PERCENTAGE_OFFSETS = Object.entries(
  INTERIOR_ORIENTATIONS
).reduce((acc, [id, intOri]) => {
  acc[id] = getOffsetFromIntOri(intOri);
  return acc;
}, {} as Record<string, { xOffset: number; yOffset: number }>);

export const PREVIEW_IMAGE_BASE_SCALE_FACTOR = 0.2462; // precision visually validated
