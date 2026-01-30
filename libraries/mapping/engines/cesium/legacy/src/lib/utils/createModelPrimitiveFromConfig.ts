import { Cartesian3, HeadingPitchRoll, Model, Transforms } from "@carma/cesium";

import type { ModelConfig } from "@carma-commons/resources";
import type { FeatureInfoProperties } from "@carma/types";

type ModelPickId = {
  id?: string;
  properties?: FeatureInfoProperties;
  is3dModel?: boolean;
};

const createModelPickId = (config: ModelConfig): ModelPickId => {
  const propsWithId = config.properties as unknown as { id?: unknown };
  const id =
    typeof propsWithId?.id === "string"
      ? propsWithId.id
      : typeof config.name === "string"
      ? config.name
      : typeof config.properties?.title === "string"
      ? config.properties.title
      : config.model.uri;

  return {
    id,
    properties: config.properties,
    is3dModel: true,
  };
};

export const createModelPrimitiveFromConfig = async (
  config: ModelConfig
): Promise<Model> => {
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

  const scale =
    typeof config.model.scale === "number" ? config.model.scale : 1.0;
  const model = await Model.fromGltfAsync({
    url: config.model.uri,
    modelMatrix,
    scale,
  });

  model.id = createModelPickId(config);

  return model;
};
