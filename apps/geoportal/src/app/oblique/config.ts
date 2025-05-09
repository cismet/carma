import { Math as CesiumMath, EasingFunction } from "cesium";
import {
  OBLIQUE_2024_ORIENTATIONS_CRS,
  OBLIQUE_2024_ORIENTATIONS_CSV_URI,
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
  orientationsURI: OBLIQUE_2024_ORIENTATIONS_CSV_URI,
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

type INTERIOR_ORIENTATION = {
  x: number;
  y: number;
  width: number;
  height: number;
  focalLength: number; // nominally 110mm
  ppm: number; // pixels per mm ; equals 1/ Pixel size 3.76µm
  rollCorrection?: number; // looks like front and rear need some extra roll correction not present in the calibration data
  label?: string; // label for the camera
  CCD_INTERIOR_ORIENTATION: [
    [number, number, number],
    [number, number, number]
  ]; // CCD interior orientation matrix as is from CAMERA_DEFINTION
};

const INTERIOR_ORIENTATIONS: Record<string, INTERIOR_ORIENTATION> =
  Object.freeze({
    // iXM-RS150F Camera or older
    // parameters manually extracted from the camera calibration data in the prj file
    // https://www.phaseone.com/wp-content/uploads/2024/01/iXM-RS150F_Fact-Sheet_Display_EN_2023.pdf
    "170": {
      label: "front",
      model: "iXM-RS150F Camera",
      x: 7102.5638,
      y: 5313,
      width: 14204,
      height: 10652,
      focalLength: 108.644,
      ppm: 265.9574468085,
      rollCorrection: 0,
      CCD_INTERIOR_ORIENTATION: [
        [0, -265.9574468085, 7102.5638],
        [-265.9574468085, 0, 5313],
      ],
    },
    "171": {
      label: "right",
      model: "iXM-RS150F Camera",
      x: 5347.5745,
      y: 7078.0957,
      width: 10652,
      height: 14204,
      focalLength: 108.723,
      ppm: 265.9574468085,
      rollCorrection: 0,
      CCD_INTERIOR_ORIENTATION: [
        [-265.9574468085, 0, 5347.5745],
        [0, 265.9574468085, 7078.0957],
      ],
    },
    "174": {
      label: "back",
      model: "iXM-RS150F Camera",
      x: 7120.6489,
      y: 5336.9362,
      width: 14204,
      height: 10652,
      focalLength: 108.632,
      ppm: 265.9574468085,
      rollCorrection: 0,
      CCD_INTERIOR_ORIENTATION: [
        [0, 265.9574468085, 7120.6489],
        [265.9574468085, 0, 5336.9362],
      ],
    },
    "176": {
      label: "left",
      model: "iXM-RS150F Camera",
      x: 5351.5638,
      y: 7099.9043,
      width: 10652,
      height: 14204,
      focalLength: 108.74,
      ppm: 265.9574468085,
      rollCorrection: 0,
      CCD_INTERIOR_ORIENTATION: [
        [265.9574468085, 0, 5351.5638],
        [0, -265.9574468085, 7099.9043],
      ],
    },
  });

const getOffsetFromIntOri = ({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => {
  // calculate the relative offset of the images in unit space
  const xOffset = 1 - x / (width * 0.5);
  const yOffset = 1 - y / (height * 0.5);
  return { xOffset, yOffset };
};

export const CAMERA_ID_INTERIOR_ORIENTATION_PERCENTAGE_OFFSETS = Object.entries(
  INTERIOR_ORIENTATIONS
).reduce((acc, [id, intOri]) => {
  acc[id] = getOffsetFromIntOri(intOri);
  return acc;
}, {} as Record<string, { xOffset: number; yOffset: number }>);

export const PREVIEW_IMAGE_BASE_SCALE_FACTOR = 0.2462; // precision visually validated
