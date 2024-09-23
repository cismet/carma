import {
  Cartesian3,
  Matrix4,
  Transforms,
  Quaternion,
  Viewer,
  Entity,
  Model,
  Cartographic,
  Math as CeMath,
} from "cesium";

import type { ModelAsset } from "@carma-mapping/cesium-engine";

let preRenderListener: () => void;

const entityData: {
  modelMatrix: Matrix4 | null;
  animatedModelMatrix: Matrix4 | null;
  model: ModelAsset | null;
} = {
  modelMatrix: null,
  animatedModelMatrix: null,
  model: null,
};
let markerModel: Model | null = null;
let lastTime: number | null = null;
let animatonSpeed = 0.001;

const markerId = "selected3dmarker";

export const addCesiumMarker = async (
  viewer: Viewer,
  pos: Cartographic,
  model: ModelAsset,
) => {
  console.log("addMarker", pos, model);

  const posCart = Cartesian3.fromRadians(
    pos.longitude,
    pos.latitude,
    pos.height,
  );
  const scale = model?.scale || 1;
  const offset = model?.anchorOffset || { x: 0, y: 0, z: 0 };
  const offsetZ = offset.z || 0;
  const modelMatrix = Transforms.eastNorthUpToFixedFrame(posCart);
  const translation = Matrix4.fromTranslation(
    new Cartesian3(0, 0, offsetZ * scale),
  );
  Matrix4.multiply(modelMatrix, translation, modelMatrix);
  entityData.model = model;
  entityData.modelMatrix = modelMatrix.clone();
  entityData.animatedModelMatrix = modelMatrix.clone();

  markerModel = await Model.fromGltfAsync({
    id: markerId,
    url: model.uri,
    modelMatrix: modelMatrix,
    scale: model.scale,
  });

  viewer.scene.primitives.add(markerModel);

  addPreRenderListener(viewer);
};

const updateMarker = (viewer: Viewer) => {
  if (markerModel && entityData.model !== null) {
    const currentTime = new Date().getTime();
    if (lastTime === null) {
      lastTime = currentTime;
    }
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    const { modelMatrix, animatedModelMatrix, model } = entityData;
    const { isCameraFacing, rotation } = model;

    if (model && modelMatrix && animatedModelMatrix) {
      let scale;
      let translation = new Cartesian3(0, 0, 0);
      if (model.fixedScale) {
        const dist = Cartesian3.distance(
          viewer.camera.position,
          new Cartesian3(modelMatrix[12], modelMatrix[13], modelMatrix[14]),
        );
        if (dist) {
          scale = new Cartesian3(dist / 1000, dist / 1000, dist / 1000);
          translation = new Cartesian3(
            0,
            0,
            ((model.scale ?? 1) * dist) / (1000 * 0.5),
          ); // offset to scale from bottom
        }
      } else {
        scale = new Cartesian3(1, 1, 1);
      }

      if (rotation) {
        const RotationQuaternion = Quaternion.fromAxisAngle(
          Cartesian3.UNIT_Z,
          (rotation === true ? 1 : rotation) * animatonSpeed * deltaTime,
        );

        const rotationMatrix = Matrix4.fromTranslationQuaternionRotationScale(
          translation,
          RotationQuaternion,
          scale,
        );
        const updatedModelMatrix = Matrix4.clone(animatedModelMatrix);
        Matrix4.multiply(
          updatedModelMatrix,
          rotationMatrix,
          updatedModelMatrix,
        );
        entityData.animatedModelMatrix = updatedModelMatrix;
        markerModel.modelMatrix = updatedModelMatrix;
      } else if (isCameraFacing) {
        const cameraHeading = viewer.camera.heading;
        const rotationQuaternion = Quaternion.fromAxisAngle(
          Cartesian3.UNIT_Z,
          -cameraHeading - CeMath.PI_OVER_TWO,
        );
        const rotationMatrix = Matrix4.fromTranslationQuaternionRotationScale(
          translation,
          rotationQuaternion,
          scale,
        );
        const updatedModelMatrix = Matrix4.clone(modelMatrix);
        Matrix4.multiply(
          updatedModelMatrix,
          rotationMatrix,
          updatedModelMatrix,
        );
        entityData.animatedModelMatrix = updatedModelMatrix;
        if (markerModel) {
          markerModel.modelMatrix = updatedModelMatrix;
        }
      }
    }
  }
};

export const removeCesiumMarker = (viewer: Viewer) => {
  if (markerModel) {
    viewer.scene.primitives.remove(markerModel);
    markerModel = null;
  }

  removePreRenderListener(viewer);
};

const addPreRenderListener = (viewer: Viewer) => {
  preRenderListener = () => updateMarker(viewer);
  viewer.scene.preRender.addEventListener(preRenderListener);
};

const removePreRenderListener = (viewer: Viewer) => {
  if (preRenderListener) {
    viewer.scene.preRender.removeEventListener(preRenderListener);
    //preRenderListener = null;
  }
};
