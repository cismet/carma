import {
  Cartesian3,
  Matrix3,
  Matrix4,
  Quaternion,
  CesiumMath,
  Camera,
  Scene,
} from "@carma/cesium";
import { Radians } from "@carma/units/types";

import type { MarkerPrimitiveData } from "./index.d";

type ScaleTranslation = {
  scale: Cartesian3;
  translation: Cartesian3;
};

type CameraPose = {
  heading: Radians | null;
  position: Cartesian3 | null;
};

const getCameraPose = (camera: Camera): CameraPose => {
  let heading: Radians | null = null;
  let position: Cartesian3 | null = null;
  heading = camera.heading as Radians;
  position = camera.position;
  return {
    heading,
    position,
  };
};

const computeScaleTranslation = (
  position: Cartesian3,
  data: MarkerPrimitiveData
): ScaleTranslation => {
  const { modelMatrix, modelConfig } = data;

  const scale = new Cartesian3(1, 1, 1);
  const translation = new Cartesian3(0, 0, 0);

  if (!modelMatrix || !modelConfig?.fixedScale) {
    return { scale, translation };
  }

  const dist = Cartesian3.distance(
    position,
    new Cartesian3(modelMatrix[12], modelMatrix[13], modelMatrix[14])
  );

  if (!dist) {
    return { scale, translation };
  }

  scale.x = scale.y = scale.z = dist / 1000;
  translation.z = ((modelConfig.scale ?? 1) * dist) / (1000 * 0.5);

  return { scale, translation };
};

const computeHeadingMatrix = (heading: Radians, matrix: Matrix4): Matrix4 => {
  const rotationQuaternion = Quaternion.fromAxisAngle(
    Cartesian3.UNIT_Z,
    -heading - CesiumMath.PI_OVER_TWO
  );
  const rotation = Matrix3.fromQuaternion(rotationQuaternion);
  return Matrix4.multiplyByMatrix3(matrix, rotation, new Matrix4());
};

export const updateTransform = (
  scene: Scene,
  data: MarkerPrimitiveData
): MarkerPrimitiveData => {
  const { modelMatrix, animatedModelMatrix, animationSpeed, modelConfig } =
    data;

  if (
    !modelConfig ||
    !modelMatrix ||
    !animatedModelMatrix ||
    data.model === null
  ) {
    return data;
  }

  const { position, heading } = getCameraPose(scene.camera);
  if (!position) {
    return data;
  }

  // update scale and translation
  const { scale, translation } = computeScaleTranslation(position, data);

  const baseMatrix = Matrix4.fromTranslationQuaternionRotationScale(
    translation,
    Quaternion.IDENTITY,
    scale
  );

  let updatedModelMatrix = Matrix4.multiply(
    Matrix4.clone(modelMatrix),
    baseMatrix,
    new Matrix4()
  );

  // update animated rotation if configured
  if (modelConfig.rotation && animationSpeed) {
    const currentTime = Date.now();
    const previousRenderTime = data.lastRenderTime ?? currentTime;
    const deltaTime = currentTime - previousRenderTime;

    data.lastRenderTime = currentTime;

    const rotationQuaternion = Quaternion.fromAxisAngle(
      Cartesian3.UNIT_Z,
      (modelConfig.rotation === true ? 1 : modelConfig.rotation) *
        animationSpeed *
        deltaTime
    );

    updatedModelMatrix = Matrix4.fromTranslationQuaternionRotationScale(
      translation,
      rotationQuaternion,
      scale
    );
    Matrix4.multiply(
      Matrix4.clone(animatedModelMatrix),
      updatedModelMatrix,
      updatedModelMatrix
    );
  }

  // update camera facing rotation around z axis if configured
  if (modelConfig.isCameraFacing && heading !== null) {
    updatedModelMatrix = computeHeadingMatrix(heading, updatedModelMatrix);
  }

  data.animatedModelMatrix = updatedModelMatrix;
  data.model.modelMatrix = updatedModelMatrix;

  return data;
};
