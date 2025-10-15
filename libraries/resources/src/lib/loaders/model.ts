import {
  Cartesian3,
  HeadingPitchRoll,
  Transforms,
  ModelGraphics,
} from "cesium";
import type { ModelConfig } from "@carma/types";

export function createModelEntityConstructorOptions(config: ModelConfig) {
  const position = Cartesian3.fromDegrees(
    config.position.longitude,
    config.position.latitude,
    config.position.altitude
  );

  const hpr = HeadingPitchRoll.fromDegrees(
    config.orientation?.heading ?? 0,
    config.orientation?.pitch ?? 0,
    config.orientation?.roll ?? 0
  );
  const orientation = Transforms.headingPitchRollQuaternion(position, hpr);

  const modelOptions: ModelGraphics.ConstructorOptions = {
    scale: 1.0,
    show: true,
    ...config.model,
  };

  // Return ConstructorOptions
  const entityOptions = {
    ...config,
    position,
    orientation,
    model: modelOptions,
  };

  return entityOptions;
}
