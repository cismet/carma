import type { ModelConfig } from "@carma/cesium/types";

export async function loadModelPrimitive(
  config: ModelConfig
): Promise<unknown> {
  const { Model, HeadingPitchRoll, Cartesian3, Transforms } = await import(
    "@carma/cesium"
  );

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
    url: config.model.url as string,
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
