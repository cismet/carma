import { Vector3 } from "three";

import type {
  AnnotationEngine,
  AnnotationScreenPosition,
} from "../annotation-engine.types";

/**
 * Port of the Cesium `cesiumCssViewMatrix`: the 2×2 CSS matrix that maps
 * local plane coordinates (metres along two world axes) to canvas pixel
 * deltas, sampled through `engine.worldToScreen`.
 */

export type CssMatrix2 = {
  a11: number;
  a12: number;
  a21: number;
  a22: number;
};

export type EngineCssViewMatrixResult = {
  originCanvas: AnnotationScreenPosition;
  forward: CssMatrix2;
  inverse: CssMatrix2;
  determinant: number;
};

export type BuildEngineCssViewMatrixOptions = {
  engine: AnnotationEngine;
  originECEF: Vector3;
  xAxisECEF: Vector3;
  yAxisECEF: Vector3;
  sampleDistance?: number;
};

const DEFAULT_SAMPLE_DISTANCE = 4;
const MIN_ABS_DETERMINANT = 1e-12;

const toCanvasDelta = (
  engine: AnnotationEngine,
  origin: Vector3,
  axis: Vector3,
  sampleDistance: number,
  originCanvas: AnnotationScreenPosition
): AnnotationScreenPosition | null => {
  const sampleWorld = origin.clone().addScaledVector(axis, sampleDistance);
  const sampleCanvas = engine.worldToScreen(sampleWorld);
  if (!sampleCanvas) return null;

  return {
    x: (sampleCanvas.x - originCanvas.x) / sampleDistance,
    y: (sampleCanvas.y - originCanvas.y) / sampleDistance,
  };
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

export const buildEngineCssViewMatrix = ({
  engine,
  originECEF,
  xAxisECEF,
  yAxisECEF,
  sampleDistance = DEFAULT_SAMPLE_DISTANCE,
}: BuildEngineCssViewMatrixOptions): EngineCssViewMatrixResult | null => {
  if (engine.isDestroyed()) return null;

  const safeSampleDistance = Math.max(0.01, sampleDistance);
  const projectedOrigin = engine.worldToScreen(originECEF);
  if (!projectedOrigin) return null;
  const originCanvas: AnnotationScreenPosition = {
    x: projectedOrigin.x,
    y: projectedOrigin.y,
  };

  const normalizedXAxis = xAxisECEF.clone().normalize();
  const normalizedYAxis = yAxisECEF.clone().normalize();

  const xDelta = toCanvasDelta(
    engine,
    originECEF,
    normalizedXAxis,
    safeSampleDistance,
    originCanvas
  );
  const yDelta = toCanvasDelta(
    engine,
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
    originCanvas,
    forward,
    inverse: inverted.inverse,
    determinant: inverted.determinant,
  };
};

export const applyCssForward = (
  matrix: CssMatrix2,
  localX: number,
  localY: number
): AnnotationScreenPosition => ({
  x: matrix.a11 * localX + matrix.a12 * localY,
  y: matrix.a21 * localX + matrix.a22 * localY,
});

export const applyCssInverse = (
  matrix: CssMatrix2,
  deltaX: number,
  deltaY: number
): AnnotationScreenPosition => ({
  x: matrix.a11 * deltaX + matrix.a12 * deltaY,
  y: matrix.a21 * deltaX + matrix.a22 * deltaY,
});
