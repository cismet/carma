import {
  CarmaTransforms,
  Cartesian3,
  Matrix4,
  Transforms,
} from "@carma/cesium";

export const POINTER_NORMAL_EPSILON_SQUARED = 1e-8;

const LOCAL_UP_ENU_FRAME_SCRATCH = new Matrix4();

export const getLocalUpDirectionECEF = (
  positionECEF: Cartesian3,
  result?: Cartesian3
): Cartesian3 => {
  const localEnuFrame = Transforms.eastNorthUpToFixedFrame(
    positionECEF,
    undefined,
    LOCAL_UP_ENU_FRAME_SCRATCH
  );
  const upDirection = CarmaTransforms.matrix4ColumnToCartesian3(
    localEnuFrame,
    2
  );
  const target = result ?? new Cartesian3();

  if (
    Cartesian3.magnitudeSquared(upDirection) <= POINTER_NORMAL_EPSILON_SQUARED
  ) {
    return Cartesian3.normalize(positionECEF, target);
  }

  return Cartesian3.normalize(upDirection, target);
};
