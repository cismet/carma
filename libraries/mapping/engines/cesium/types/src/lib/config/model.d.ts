import type { Model } from "@carma/cesium";
import type { FeatureInfoProperties } from "@carma/types";
import { LatLngAlt, HeadingPitchRoll } from "@carma/geo/types";

type Options = Model.ConstructorOptions;

// Refactored to use Model primitive instead of Entity
export interface ModelConfig {
  /** Geographic position in degrees and meters - gets converted to Cartesian3 */
  position: LatLngAlt.deg;
  /** Orientation in degrees - gets converted to quaternion */
  orientation?: HeadingPitchRoll.deg;
  model: Partial<Options> & Required<Pick<Options, "url">>;
  /** Display name for the model */
  name?: string;
  // linked information for feature info of topicmap
  properties: FeatureInfoProperties;
}
