import {
  Cartesian3,
  HeadingPitchRoll,
  Transforms,
  Entity,
  ModelGraphics,
} from "cesium";

import type { FeatureInfoProperties } from "@carma/types";

export interface ModelConfig
  extends Partial<Omit<Entity.ConstructorOptions, "position" | "orientation">> {
  /** Geographic position in degrees and meters - gets converted to Cartesian3 */
  position: {
    longitude: number; // degrees
    latitude: number; // degrees
    altitude: number; // meters
  };
  /** Orientation in degrees - gets converted to quaternion */
  orientation?: {
    heading?: number; // degrees
    pitch?: number; // degrees
    roll?: number; // degrees
  };
  model: Partial<ModelGraphics.ConstructorOptions> & { uri: string };
  properties: FeatureInfoProperties;
}

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
