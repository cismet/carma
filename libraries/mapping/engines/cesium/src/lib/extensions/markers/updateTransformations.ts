import { Cartesian3, Matrix4, Quaternion, Math as CesiumMath } from "cesium";
import { Radians } from "@carma/types";

import type { MarkerPrimitiveData } from "./index.d";
import type { CesiumContextType } from "../../CesiumContext";

type ScaleTranslation = {
  scale: Cartesian3;
  translation: Cartesian3;
};

const computeScaleTranslation = (
  ctx: CesiumContextType,
  data: MarkerPrimitiveData
): ScaleTranslation => {
  const { modelMatrix, modelConfig } = data;

  const scale = new Cartesian3(1, 1, 1);
  const translation = new Cartesian3(0, 0, 0);

  if (!modelMatrix || !modelConfig?.fixedScale) {
    return { scale, translation };
  }

  ctx.withCamera((camera) => {
    const dist = Cartesian3.distance(
      camera.position,
      new Cartesian3(modelMatrix[12], modelMatrix[13], modelMatrix[14])
    );

    if (!dist) {
      return;
    }

    scale.x = scale.y = scale.z = dist / 1000;
    translation.z = ((modelConfig.scale ?? 1) * dist) / (1000 * 0.5);
  });

  return { scale, translation };
};

const getHeading = (ctx: CesiumContextType): Radians | null => {
  let heading: Radians | null = null;
  ctx.withCamera((camera) => (heading = camera.heading as Radians));
  return heading;
};

export const updateViewerFacing = (
  ctx: CesiumContextType,
  data: MarkerPrimitiveData
): MarkerPrimitiveData => {
  const { modelMatrix, modelConfig } = data;

  if (!modelConfig || !modelMatrix || data.model === null) {
    return data;
  }

  const { scale, translation } = computeScaleTranslation(ctx, data);
  const heading = modelConfig.isCameraFacing ? getHeading(ctx) : null;

  const rotationQuaternion =
    heading !== null
      ? Quaternion.fromAxisAngle(
          Cartesian3.UNIT_Z,
          -heading - CesiumMath.PI_OVER_TWO
        )
      : Quaternion.IDENTITY;

  const rotationMatrix = Matrix4.fromTranslationQuaternionRotationScale(
    translation,
    rotationQuaternion,
    scale
  );

  const updatedModelMatrix = Matrix4.clone(modelMatrix);
  Matrix4.multiply(updatedModelMatrix, rotationMatrix, updatedModelMatrix);

  data.animatedModelMatrix = updatedModelMatrix;
  data.model.modelMatrix = updatedModelMatrix;

  return data;
};

export const updateRotating = (
  ctx: CesiumContextType,
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

  if (!modelConfig.rotation || !animationSpeed) {
    return updateViewerFacing(ctx, data);
  }

  const currentTime = Date.now();
  const previousRenderTime = data.lastRenderTime ?? currentTime;
  const deltaTime = currentTime - previousRenderTime;

  data.lastRenderTime = currentTime;

  const { scale, translation } = computeScaleTranslation(ctx, data);

  const rotationQuaternion = Quaternion.fromAxisAngle(
    Cartesian3.UNIT_Z,
    (modelConfig.rotation === true ? 1 : modelConfig.rotation) *
      animationSpeed *
      deltaTime
  );

  const rotationMatrix = Matrix4.fromTranslationQuaternionRotationScale(
    translation,
    rotationQuaternion,
    scale
  );

  const updatedModelMatrix = Matrix4.clone(animatedModelMatrix);
  Matrix4.multiply(updatedModelMatrix, rotationMatrix, updatedModelMatrix);

  data.animatedModelMatrix = updatedModelMatrix;
  data.model.modelMatrix = updatedModelMatrix;

  if (modelConfig.isCameraFacing) {
    updateViewerFacing(ctx, data);
  }

  return data;
};
