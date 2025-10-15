import { ModelGraphics, Entity } from "cesium";
import { FeatureInfoProperties } from "../feature-info";
import { LatLng, HeadingPitchRoll } from "../geo/geo";

type Options = ModelGraphics.ConstructorOptions;

export interface ModelConfig
  extends Partial<Omit<Entity.ConstructorOptions, "position" | "orientation">> {
  /** Geographic position in degrees and meters - gets converted to Cartesian3 */
  position: LatLng.deg;
  /** Orientation in degrees - gets converted to quaternion */
  orientation?: HeadingPitchRoll.deg;
  model: Partial<Options> & Required<Pick<Options, "uri">>;
  // linked information for feature info of topicmap
  properties: FeatureInfoProperties;
}
