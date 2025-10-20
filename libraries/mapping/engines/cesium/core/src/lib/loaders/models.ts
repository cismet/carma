import {
  Cartesian3,
  HeadingPitchRoll,
  Transforms,
  ModelGraphics,
  Model,
} from "@carma/cesium";
import type { ModelConfig } from "../types/config";

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

  const entityOptions = {
    ...config,
    position,
    orientation,
    model: modelOptions,
  };

  return entityOptions;
}

export async function loadModelPrimitive(config: ModelConfig): Promise<Model> {
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

  const modelMatrix = Transforms.headingPitchRollToFixedFrame(position, hpr);

  const model = await Model.fromGltfAsync({
    url: config.model.uri as string,
    modelMatrix,
  });

  if (config.model.scale !== undefined) {
    model.scale =
      typeof config.model.scale === "number" ? config.model.scale : 1.0;
  }
  if (config.model.show !== undefined) {
    model.show =
      typeof config.model.show === "boolean" ? config.model.show : true;
  }

  return model;
}
