import * as THREE from "three";
import type {
  ViewStateVisualizerLabelAnchor,
  ViewStateVisualizerSize,
} from "../types";

// NOTE: These helpers intentionally mix Three world projection with screen-space
// label placement. Keep them scoped here under `overlay` for now. If CARMA's
// broader overlay/label engines converge on the same concepts later, this is a
// good consolidation seam.

export const projectPointToCanvas = (
  point: THREE.Vector3,
  size: ViewStateVisualizerSize,
  camera: THREE.Camera
): ViewStateVisualizerLabelAnchor => {
  const projected = point.clone().project(camera);
  return {
    leftPx: (projected.x * 0.5 + 0.5) * size.widthPx,
    topPx: (-projected.y * 0.5 + 0.5) * size.heightPx,
  };
};

export const projectOrthogonalLineLabelAnchor = ({
  lineStart,
  lineEnd,
  size,
  camera,
  offsetPx,
  biasToward,
}: {
  lineStart: THREE.Vector3;
  lineEnd: THREE.Vector3;
  size: ViewStateVisualizerSize;
  camera: THREE.Camera;
  offsetPx: number;
  biasToward?: THREE.Vector3;
}): ViewStateVisualizerLabelAnchor => {
  const projectedStart = projectPointToCanvas(lineStart, size, camera);
  const projectedEnd = projectPointToCanvas(lineEnd, size, camera);
  const midpoint = new THREE.Vector2(
    (projectedStart.leftPx + projectedEnd.leftPx) * 0.5,
    (projectedStart.topPx + projectedEnd.topPx) * 0.5
  );
  const tangent = new THREE.Vector2(
    projectedEnd.leftPx - projectedStart.leftPx,
    projectedEnd.topPx - projectedStart.topPx
  );

  if (tangent.lengthSq() < 1e-6) {
    return {
      leftPx: midpoint.x,
      topPx: midpoint.y,
    };
  }

  const normal = new THREE.Vector2(-tangent.y, tangent.x).normalize();
  if (biasToward) {
    const projectedBias = projectPointToCanvas(biasToward, size, camera);
    const biasVector = new THREE.Vector2(
      projectedBias.leftPx - midpoint.x,
      projectedBias.topPx - midpoint.y
    );
    if (normal.dot(biasVector) < 0) {
      normal.multiplyScalar(-1);
    }
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
  offsetPx,
  biasToward,
}: {
  points: THREE.Vector3[];
  size: ViewStateVisualizerSize;
  camera: THREE.Camera;
  offsetPx: number;
  biasToward?: THREE.Vector3;
}): ViewStateVisualizerLabelAnchor => {
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

  const projectedCenter = projectPointToCanvas(centerPoint, size, camera);
  const projectedPrev = projectPointToCanvas(prevPoint, size, camera);
  const projectedNext = projectPointToCanvas(nextPoint, size, camera);
  const tangent = new THREE.Vector2(
    projectedNext.leftPx - projectedPrev.leftPx,
    projectedNext.topPx - projectedPrev.topPx
  );

  if (tangent.lengthSq() < 1e-6) {
    return projectedCenter;
  }

  const normal = new THREE.Vector2(-tangent.y, tangent.x).normalize();
  if (biasToward) {
    const projectedBias = projectPointToCanvas(biasToward, size, camera);
    const biasVector = new THREE.Vector2(
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
