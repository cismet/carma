import { Vector2, Vector3 } from "three";
import type { Camera } from "three";
import type {
  ViewStateVisualizerLabelAnchor,
  ViewStateVisualizerSize,
} from "../view-state-visualizer-types";

// NOTE: These helpers intentionally mix Three world projection with screen-space
// label placement. Keep them scoped here under `projection` for now. If
// CARMA's broader overlay/label engines converge on the same concepts later,
// this is still a good consolidation seam.

export const projectPointToCanvas = (
  point: Vector3,
  size: ViewStateVisualizerSize,
  camera: Camera
): ViewStateVisualizerLabelAnchor => {
  const projected = point.clone().project(camera);
  return {
    leftPx: (projected.x * 0.5 + 0.5) * size.widthPx,
    topPx: (-projected.y * 0.5 + 0.5) * size.heightPx,
  };
};

export type PointToCanvasProjector = (
  point: Vector3
) => ViewStateVisualizerLabelAnchor;

export const createPointToCanvasProjector = (
  size: ViewStateVisualizerSize,
  camera: Camera
): PointToCanvasProjector => {
  const projected = new Vector3();
  return (point: Vector3) => {
    projected.copy(point).project(camera);
    return {
      leftPx: (projected.x * 0.5 + 0.5) * size.widthPx,
      topPx: (-projected.y * 0.5 + 0.5) * size.heightPx,
    };
  };
};

export const projectOrthogonalLineLabelAnchor = ({
  lineStart,
  lineEnd,
  size,
  camera,
  projectPoint,
  offsetPx,
  biasToward,
  fallbackBiasToward,
  biasDotEpsilonPx = 0.5,
}: {
  lineStart: Vector3;
  lineEnd: Vector3;
  size: ViewStateVisualizerSize;
  camera: Camera;
  projectPoint?: PointToCanvasProjector;
  offsetPx: number;
  biasToward?: Vector3;
  fallbackBiasToward?: Vector3;
  biasDotEpsilonPx?: number;
}): ViewStateVisualizerLabelAnchor => {
  const pointProjector =
    projectPoint ?? createPointToCanvasProjector(size, camera);
  const projectedStart = pointProjector(lineStart);
  const projectedEnd = pointProjector(lineEnd);
  const midpoint = new Vector2(
    (projectedStart.leftPx + projectedEnd.leftPx) * 0.5,
    (projectedStart.topPx + projectedEnd.topPx) * 0.5
  );
  const tangent = new Vector2(
    projectedEnd.leftPx - projectedStart.leftPx,
    projectedEnd.topPx - projectedStart.topPx
  );

  if (tangent.lengthSq() < 1e-6) {
    return {
      leftPx: midpoint.x,
      topPx: midpoint.y,
    };
  }

  const normal = new Vector2(-tangent.y, tangent.x).normalize();
  const applyBias = (biasPoint: Vector3): number => {
    const projectedBias = pointProjector(biasPoint);
    const biasVector = new Vector2(
      projectedBias.leftPx - midpoint.x,
      projectedBias.topPx - midpoint.y
    );

    if (biasVector.lengthSq() < 1e-6) {
      return 0;
    }

    return normal.dot(biasVector);
  };

  const primaryBiasDot = biasToward ? applyBias(biasToward) : 0;
  const fallbackBiasDot =
    Math.abs(primaryBiasDot) <= biasDotEpsilonPx && fallbackBiasToward
      ? applyBias(fallbackBiasToward)
      : 0;
  const resolvedBiasDot =
    Math.abs(fallbackBiasDot) > biasDotEpsilonPx
      ? fallbackBiasDot
      : primaryBiasDot;

  if (resolvedBiasDot < 0) {
    normal.multiplyScalar(-1);
  }

  return {
    leftPx: midpoint.x + normal.x * offsetPx,
    topPx: midpoint.y + normal.y * offsetPx,
  };
};

export const projectOrthogonalPolylineLabelAnchor = ({
  points,
  size,
  camera,
  projectPoint,
  offsetPx,
  biasToward,
}: {
  points: Vector3[];
  size: ViewStateVisualizerSize;
  camera: Camera;
  projectPoint?: PointToCanvasProjector;
  offsetPx: number;
  biasToward?: Vector3;
}): ViewStateVisualizerLabelAnchor => {
  const pointProjector =
    projectPoint ?? createPointToCanvasProjector(size, camera);
  if (points.length < 2) {
    return {
      leftPx: size.widthPx * 0.5,
      topPx: size.heightPx * 0.5,
    };
  }

  const midpointIndex = Math.floor(points.length * 0.5);
  const centerPoint = points[Math.min(midpointIndex, points.length - 1)];
  const prevPoint = points[Math.max(0, midpointIndex - 1)];
  const nextPoint = points[Math.min(points.length - 1, midpointIndex + 1)];

  const projectedCenter = pointProjector(centerPoint);
  const projectedPrev = pointProjector(prevPoint);
  const projectedNext = pointProjector(nextPoint);
  const tangent = new Vector2(
    projectedNext.leftPx - projectedPrev.leftPx,
    projectedNext.topPx - projectedPrev.topPx
  );

  if (tangent.lengthSq() < 1e-6) {
    return projectedCenter;
  }

  const normal = new Vector2(-tangent.y, tangent.x).normalize();
  if (biasToward) {
    const projectedBias = pointProjector(biasToward);
    const biasVector = new Vector2(
      projectedBias.leftPx - projectedCenter.leftPx,
      projectedBias.topPx - projectedCenter.topPx
    );
    if (normal.dot(biasVector) < 0) {
      normal.multiplyScalar(-1);
    }
  }

  return {
    leftPx: projectedCenter.leftPx + normal.x * offsetPx,
    topPx: projectedCenter.topPx + normal.y * offsetPx,
  };
};
