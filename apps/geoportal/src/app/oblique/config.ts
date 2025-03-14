import { Math as CesiumMath } from "cesium";
import {
  OBLIQUE_2024_ORIENTATIONS_CRS,
  OBLIQUE_2024_ORIENTATIONS_CSV_URI,
  OBLIQUE_2024_PREVIEW_PATH,
  OBLIQUE_2024_CENTROIDS_CSV_URI,
} from "@carma-commons/resources";
import { OBLIQUE_PREVIEW_QUALITY } from "./constants";
import { ObliqueDataProviderConfig } from "./types";
import { CardinalDirectionEnum } from "./utils/orientationUtils";

export const OBLIQUE_CONFIG: ObliqueDataProviderConfig = {
  fixedPitch: CesiumMath.toRadians(-49), // Pitch in radians
  fixedHeight: 924, // Height in meters
  minFov: CesiumMath.toRadians(10), // Minimum field of view in radians
  maxFov: CesiumMath.toRadians(120), // Maximum field of view in radians
  headingOffset: CesiumMath.toRadians(-34.3), // Heading offset in radians
  previewQualityLevel: OBLIQUE_PREVIEW_QUALITY.LEVEL_3,
  previewPath: OBLIQUE_2024_PREVIEW_PATH,
  crs: OBLIQUE_2024_ORIENTATIONS_CRS,
  orientationsURI: OBLIQUE_2024_ORIENTATIONS_CSV_URI,
  centroidsURI: OBLIQUE_2024_CENTROIDS_CSV_URI,
};

export const NUM_NEAREST_IMAGES = 200;

export const CAMERA_ID_TO_DIRECTION = {
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
};
