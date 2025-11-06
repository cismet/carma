import {
  Cartesian3,
  Matrix4,
  Model,
  Scene,
  Transforms,
  type Cartographic,
} from "cesium";

import type {
  MarkerPrimitiveData,
  MarkerModelAsset,
  PolylineConfig,
} from "./index.d";

import { createOrUpdateStemline } from "./stemline";

const defaultMarkerOptions = {
  id: "selected3dmarker",
} as const;

export type BuildMarkerParams = {
  scene: Scene;
  pos: Cartographic;
  groundPos: Cartographic;
  modelConfig: MarkerModelAsset;
  options: {
    model?: Model | null;
    id?: string;
    stemline?: PolylineConfig;
  };
};

export const buildMarkerData = async ({
  scene,
  pos,
  groundPos,
  modelConfig,
  options,
}: BuildMarkerParams): Promise<MarkerPrimitiveData> => {
  const { id, model } = { ...defaultMarkerOptions, ...options };

  const markerData: MarkerPrimitiveData = {
    id,
    modelMatrix: null,
    animatedModelMatrix: null,
    modelConfig,
    model: null,
  };

  const posCartesian = Cartesian3.fromRadians(
    pos.longitude,
    pos.latitude,
    pos.height
  );
  const scale = modelConfig.scale ?? 1;
  const offset = modelConfig.anchorOffset ?? { x: 0, y: 0, z: 0 };
  const modelMatrix = Transforms.eastNorthUpToFixedFrame(posCartesian);
  const anchorTranslation = Matrix4.fromTranslation(
    new Cartesian3(0, 0, (offset.z ?? 0) * scale)
  );
  Matrix4.multiply(modelMatrix, anchorTranslation, modelMatrix);

  markerData.modelMatrix = Matrix4.clone(modelMatrix);
  markerData.animatedModelMatrix = Matrix4.clone(modelMatrix);

  const markerModel = model
    ? reuseExistingModel(model, modelMatrix, modelConfig)
    : await createModelFromConfig(id, modelMatrix, modelConfig);

  markerData.model = markerModel;

  try {
    if (options.stemline || modelConfig.stemline) {
      createOrUpdateStemline(scene, markerData, [pos, groundPos], {
        ...modelConfig.stemline,
        ...options.stemline,
      });
    }
  } catch (error) {
    console.error("[CESIUM|MARKER] error adding/updating stemline", error);
  }

  return markerData;
};

const reuseExistingModel = (
  model: Model,
  modelMatrix: Matrix4,
  modelConfig: MarkerModelAsset
) => {
  console.debug("[CESIUM|MARKER|MODEL] Reusing existing marker Model");
  model.modelMatrix = modelMatrix;
  model.scale = modelConfig.scale ?? 1;
  return model;
};

const createModelFromConfig = async (
  id: string,
  modelMatrix: Matrix4,
  modelConfig: MarkerModelAsset
) => {
  console.debug(
    "[CESIUM|MARKER|MODEL] creating marker model from file",
    modelConfig.uri
  );
  return Model.fromGltfAsync({
    id,
    url: modelConfig.uri,
    modelMatrix,
    scale: modelConfig.scale,
  });
};
