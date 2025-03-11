import { Math as CesiumMath } from "cesium";
import {
  OBLIQUE_2024_ORIENTATIONS_CRS,
  OBLIQUE_2024_ORIENTATIONS_CSV_URI,
  OBLIQUE_2024_PREVIEW_PATH,
} from "@carma-commons/resources";
import { OBLIQUE_PREVIEW_QUALITY } from "./constants";
import { ObliqueDataProviderConfig } from "./types";

export const OBLIQUE_CONFIG: ObliqueDataProviderConfig = {
  fixedPitch: CesiumMath.toRadians(-45), // Pitch in radians
  fixedHeight: 835, // Height in meters
  minFov: CesiumMath.toRadians(10), // Minimum field of view in radians
  maxFov: CesiumMath.toRadians(120), // Maximum field of view in radians
  headingOffset: CesiumMath.toRadians(-34.3), // Heading offset in radians
  previewQualityLevel: OBLIQUE_PREVIEW_QUALITY.LEVEL_3,
  previewPath: OBLIQUE_2024_PREVIEW_PATH,
  crs: OBLIQUE_2024_ORIENTATIONS_CRS,
  uri: OBLIQUE_2024_ORIENTATIONS_CSV_URI,
};
