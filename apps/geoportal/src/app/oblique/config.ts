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
    footprintExtrusion: {
      duration: 500,
      easingFunction: EasingFunction.QUADRATIC_IN_OUT,
    },
    outlineFadeOut: {
      delay: 300,
      duration: 500,
      easingFunction: EasingFunction.QUADRATIC_IN_OUT,
    },
  },
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
