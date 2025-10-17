import type { Metadata } from "./metadata";
import type { LatLng, HeadingPitchRoll } from "@carma/geo/types";

/**
 * Model resource configuration (simplified, no Cesium dependencies)
 * For full Cesium ModelConfig, see @carma-mapping/engines/cesium/core
 */
export type ModelResourceConfig = {
  uri: string;
  position: LatLng.deg;
  orientation?: HeadingPitchRoll.deg;
  metadata?: Metadata;
};
