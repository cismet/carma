import { BufferGeometry, Mesh, Vector3, type Camera } from "three";
import type { ViewStateVisualizerSize } from "../view-state-visualizer-types";
import { createPointToCanvasProjector } from "../projection/label-anchors";

type CanvasPoint = {
  x: number;
  y: number;
};

const cross2d = (origin: CanvasPoint, a: CanvasPoint, b: CanvasPoint): number =>
  (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

const buildConvexHull = (points: CanvasPoint[]): CanvasPoint[] => {
  const uniquePoints = points
    .map((point) => ({
      x: Number(point.x.toFixed(4)),
      y: Number(point.y.toFixed(4)),
    }))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
    .filter(
      (point, index, array) =>
        index === 0 ||
        point.x !== array[index - 1].x ||
        point.y !== array[index - 1].y
    );

  if (uniquePoints.length <= 2) {
    return uniquePoints;
  }

  const lower: CanvasPoint[] = [];
  uniquePoints.forEach((point) => {
    while (
      lower.length >= 2 &&
      cross2d(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  });

  const upper: CanvasPoint[] = [];
  [...uniquePoints].reverse().forEach((point) => {
    while (
      upper.length >= 2 &&
      cross2d(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  });

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
};

const isPointInsideConvexPolygon = (
  point: CanvasPoint,
  polygon: CanvasPoint[]
): boolean => {
  if (polygon.length < 3) {
    return false;
  }

  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const cross = cross2d(current, next, point);
    if (Math.abs(cross) < 1e-6) {
      continue;
    }

    const nextSign = Math.sign(cross);
    if (sign === 0) {
      sign = nextSign;
      continue;
    }

    if (sign !== nextSign) {
      return false;
    }
  }

  return true;
};

export const isPointerInsideProjectedMesh = ({
  clientX,
  clientY,
  mesh,
  geometry,
  size,
  camera,
  canvas,
}: {
  clientX: number;
  clientY: number;
  mesh: Mesh;
  geometry: BufferGeometry;
  size: ViewStateVisualizerSize;
  camera: Camera;
  canvas: HTMLCanvasElement;
}): boolean => {
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) {
    return false;
  }

  const rect = canvas.getBoundingClientRect();
  const pointer = {
    x: ((clientX - rect.left) / rect.width) * size.widthPx,
    y: ((clientY - rect.top) / rect.height) * size.heightPx,
  } satisfies CanvasPoint;

  const vertex = new Vector3();
  const projectPoint = createPointToCanvasProjector(size, camera);
  const projectedPoints = Array.from({ length: position.count }, (_, index) => {
    vertex.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
    const projected = projectPoint(vertex);
    return {
      x: projected.leftPx,
      y: projected.topPx,
    } satisfies CanvasPoint;
  });

  return isPointInsideConvexPolygon(pointer, buildConvexHull(projectedPoints));
};
