import { Math as CesiumMath, Color, EasingFunction } from "cesium";
import {
  OBLIQUE_2024,
  OBLIQUE_2024_FPRFC_GEOJSON_URI,
} from "@carma-commons/resources";
import { OBLIQUE_PREVIEW_QUALITY } from "./constants";
import { ObliqueDataProviderConfig } from "./types";

export const OBLIQUE_CONFIG: ObliqueDataProviderConfig = {
  fixedPitch: CesiumMath.toRadians(-45), // Pitch in radians
  fixedHeight: 900, // Height in meters
  minFov: CesiumMath.toRadians(10), // Minimum field of view in radians
  maxFov: CesiumMath.toRadians(120), // Maximum field of view in radians
  headingOffset: CesiumMath.toRadians(-34.3), // Heading offset in radians
  previewQualityLevel: OBLIQUE_PREVIEW_QUALITY.LEVEL_3,
  previewPath: OBLIQUE_2024.uri,
  crs: OBLIQUE_2024.exteriorOrientations.crs,
  exteriorOrientationsURI: OBLIQUE_2024.exteriorOrientations.uri,
  interiorOrientations: OBLIQUE_2024.interiorOrientations,
  upMatrixMapping: OBLIQUE_2024.upMatrixMapping,
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

export const PREVIEW_IMAGE_BASE_SCALE_FACTOR = 0.2462; // precision visually validated
