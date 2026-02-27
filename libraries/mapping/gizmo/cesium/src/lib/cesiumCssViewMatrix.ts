import {
  Cartesian2,
  Cartesian3,
  SceneTransforms,
  defined,
  type Scene,
} from "@carma/cesium";

export type CssMatrix2 = {
  a11: number;
  a12: number;
  a21: number;
  a22: number;
};

export type CesiumCssViewMatrixResult = {
  originCanvas: Cartesian2;
  forward: CssMatrix2;
  inverse: CssMatrix2;
  determinant: number;
};

export type BuildCesiumCssViewMatrixOptions = {
  scene: Scene;
  originECEF: Cartesian3;
  xAxisECEF: Cartesian3;
  yAxisECEF: Cartesian3;
  sampleDistance?: number;
};

const DEFAULT_SAMPLE_DISTANCE = 4;
const MIN_ABS_DETERMINANT = 1e-12;

const toCanvasDelta = (
  scene: Scene,
  origin: Cartesian3,
  axis: Cartesian3,
  sampleDistance: number,
  originCanvas: Cartesian2
): Cartesian2 | null => {
  const sampleWorld = Cartesian3.add(
    origin,
    Cartesian3.multiplyByScalar(axis, sampleDistance, new Cartesian3()),
    new Cartesian3()
  );
  const sampleCanvas = SceneTransforms.worldToWindowCoordinates(
    scene,
    sampleWorld
  );
  if (!defined(sampleCanvas)) return null;

  return new Cartesian2(
    (sampleCanvas.x - originCanvas.x) / sampleDistance,
    (sampleCanvas.y - originCanvas.y) / sampleDistance
  );
};

const invert2x2 = (
  matrix: CssMatrix2
): { inverse: CssMatrix2; determinant: number } | null => {
  const determinant = matrix.a11 * matrix.a22 - matrix.a12 * matrix.a21;
  if (Math.abs(determinant) < MIN_ABS_DETERMINANT) return null;

  return {
    determinant,
    inverse: {
      a11: matrix.a22 / determinant,
      a12: -matrix.a12 / determinant,
      a21: -matrix.a21 / determinant,
      a22: matrix.a11 / determinant,
    },
  };
};

export const buildCesiumCssViewMatrix = ({
  scene,
  originECEF,
  xAxisECEF,
  yAxisECEF,
  sampleDistance = DEFAULT_SAMPLE_DISTANCE,
}: BuildCesiumCssViewMatrixOptions): CesiumCssViewMatrixResult | null => {
  if (scene.isDestroyed()) return null;

  const safeSampleDistance = Math.max(0.01, sampleDistance);
  const originCanvas = SceneTransforms.worldToWindowCoordinates(
    scene,
    originECEF
  );
  if (!defined(originCanvas)) return null;

  const normalizedXAxis = Cartesian3.normalize(xAxisECEF, new Cartesian3());
  const normalizedYAxis = Cartesian3.normalize(yAxisECEF, new Cartesian3());

  const xDelta = toCanvasDelta(
    scene,
    originECEF,
    normalizedXAxis,
    safeSampleDistance,
    originCanvas
  );
  const yDelta = toCanvasDelta(
    scene,
    originECEF,
    normalizedYAxis,
    safeSampleDistance,
    originCanvas
  );
  if (!xDelta || !yDelta) return null;

  const forward: CssMatrix2 = {
    a11: xDelta.x,
    a12: yDelta.x,
    a21: xDelta.y,
    a22: yDelta.y,
  };

  const inverted = invert2x2(forward);
  if (!inverted) return null;

  return {
    originCanvas: new Cartesian2(originCanvas.x, originCanvas.y),
    forward,
    inverse: inverted.inverse,
    determinant: inverted.determinant,
  };
};

export const applyCssForward = (
  matrix: CssMatrix2,
  localX: number,
  localY: number
): Cartesian2 =>
  new Cartesian2(
    matrix.a11 * localX + matrix.a12 * localY,
    matrix.a21 * localX + matrix.a22 * localY
  );

export const applyCssInverse = (
  matrix: CssMatrix2,
  deltaX: number,
  deltaY: number
): Cartesian2 =>
  new Cartesian2(
    matrix.a11 * deltaX + matrix.a12 * deltaY,
    matrix.a21 * deltaX + matrix.a22 * deltaY
  );

export default buildCesiumCssViewMatrix;
