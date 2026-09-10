import {
  Box3,
  Camera,
  Frustum,
  Matrix4,
  Plane,
  Vector3,
  WebGPUCoordinateSystem,
} from "three";

const BOX_EDGE_INDICES = [
  [0, 1],
  [1, 3],
  [3, 2],
  [2, 0],
  [4, 5],
  [5, 7],
  [7, 6],
  [6, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

const buildBoxCorners = ({ min, max }: Box3) => [
  new Vector3(min.x, min.y, min.z),
  new Vector3(max.x, min.y, min.z),
  new Vector3(min.x, max.y, min.z),
  new Vector3(max.x, max.y, min.z),
  new Vector3(min.x, min.y, max.z),
  new Vector3(max.x, min.y, max.z),
  new Vector3(min.x, max.y, max.z),
  new Vector3(max.x, max.y, max.z),
];

const buildFrustumCorners = (camera: Camera) => {
  const nearClipZ = camera.coordinateSystem === WebGPUCoordinateSystem ? 0 : -1;
  return [nearClipZ, 1].flatMap((z) =>
    [-1, 1].flatMap((y) =>
      [-1, 1].map((x) => new Vector3(x, y, z).unproject(camera))
    )
  );
};

const containsWithTolerance = (
  planes: readonly Plane[],
  point: Vector3,
  tolerance: number
) => planes.every((plane) => plane.distanceToPoint(point) >= -tolerance);

const boxContainsWithTolerance = (
  box: Box3,
  point: Vector3,
  tolerance: number
) =>
  point.x >= box.min.x - tolerance &&
  point.x <= box.max.x + tolerance &&
  point.y >= box.min.y - tolerance &&
  point.y <= box.max.y + tolerance &&
  point.z >= box.min.z - tolerance &&
  point.z <= box.max.z + tolerance;

const appendUniquePoint = (
  points: Vector3[],
  candidate: Vector3,
  toleranceSquared: number
) => {
  if (
    points.some(
      (existing) => existing.distanceToSquared(candidate) <= toleranceSquared
    )
  ) {
    return;
  }
  points.push(candidate);
};

const appendSegmentPlaneIntersections = (
  start: Vector3,
  end: Vector3,
  planes: readonly Plane[],
  accepts: (point: Vector3) => boolean,
  points: Vector3[],
  toleranceSquared: number
) => {
  const delta = end.clone().sub(start);
  for (const plane of planes) {
    const startDistance = plane.distanceToPoint(start);
    const endDistance = plane.distanceToPoint(end);
    const denominator = startDistance - endDistance;
    if (Math.abs(denominator) <= Number.EPSILON) continue;
    const interpolation = startDistance / denominator;
    if (interpolation < 0 || interpolation > 1) continue;
    const candidate = start.clone().addScaledVector(delta, interpolation);
    if (accepts(candidate)) {
      appendUniquePoint(points, candidate, toleranceSquared);
    }
  }
};

export const getFrustumBoxIntersectionPoints = (
  camera: Camera,
  box: Box3,
  tolerance = 1e-6
): Vector3[] => {
  if (box.isEmpty()) return [];
  camera.updateMatrixWorld(true);
  const frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    ),
    camera.coordinateSystem,
    camera.reversedDepth
  );
  if (!frustum.intersectsBox(box)) return [];

  const toleranceSquared = tolerance * tolerance;
  const boxCorners = buildBoxCorners(box);
  const frustumCorners = buildFrustumCorners(camera);
  const points: Vector3[] = [];
  for (const point of boxCorners) {
    if (containsWithTolerance(frustum.planes, point, tolerance)) {
      appendUniquePoint(points, point, toleranceSquared);
    }
  }
  for (const point of frustumCorners) {
    if (boxContainsWithTolerance(box, point, tolerance)) {
      appendUniquePoint(points, point, toleranceSquared);
    }
  }

  for (const [startIndex, endIndex] of BOX_EDGE_INDICES) {
    appendSegmentPlaneIntersections(
      boxCorners[startIndex],
      boxCorners[endIndex],
      frustum.planes,
      (point) => containsWithTolerance(frustum.planes, point, tolerance),
      points,
      toleranceSquared
    );
  }

  const boxPlanes = [
    new Plane(new Vector3(1, 0, 0), -box.min.x),
    new Plane(new Vector3(-1, 0, 0), box.max.x),
    new Plane(new Vector3(0, 1, 0), -box.min.y),
    new Plane(new Vector3(0, -1, 0), box.max.y),
    new Plane(new Vector3(0, 0, 1), -box.min.z),
    new Plane(new Vector3(0, 0, -1), box.max.z),
  ];
  for (const [startIndex, endIndex] of BOX_EDGE_INDICES) {
    appendSegmentPlaneIntersections(
      frustumCorners[startIndex],
      frustumCorners[endIndex],
      boxPlanes,
      (point) =>
        boxContainsWithTolerance(box, point, tolerance) &&
        containsWithTolerance(frustum.planes, point, tolerance),
      points,
      toleranceSquared
    );
  }

  return points;
};
