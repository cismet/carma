export type Point3 = {
  x: number;
  y: number;
  z: number;
};

export const subtractPoint3 = (left: Point3, right: Point3): Point3 => ({
  x: left.x - right.x,
  y: left.y - right.y,
  z: left.z - right.z,
});

export const addPoint3 = (left: Point3, right: Point3): Point3 => ({
  x: left.x + right.x,
  y: left.y + right.y,
  z: left.z + right.z,
});

export const scalePoint3 = (point: Point3, scale: number): Point3 => ({
  x: point.x * scale,
  y: point.y * scale,
  z: point.z * scale,
});

export const dotPoint3 = (left: Point3, right: Point3): number =>
  left.x * right.x + left.y * right.y + left.z * right.z;

export const crossPoint3 = (left: Point3, right: Point3): Point3 => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

export const getPointLength3d = (point: Point3): number =>
  Math.hypot(point.x, point.y, point.z);

export const projectPointOntoPlane3d = ({
  point,
  planeAnchor,
  planeNormal,
  epsilon = 1e-9,
}: {
  point: Point3;
  planeAnchor: Point3;
  planeNormal: Point3;
  epsilon?: number;
}): Point3 | null => {
  const normalLength = getPointLength3d(planeNormal);
  if (normalLength <= epsilon) {
    return null;
  }

  const normalDirection = scalePoint3(planeNormal, 1 / normalLength);
  const delta = subtractPoint3(point, planeAnchor);
  return subtractPoint3(
    point,
    scalePoint3(normalDirection, dotPoint3(delta, normalDirection))
  );
};

export const getPointPlaneOrthogonalToLineAngleErrorDeg3d = ({
  point,
  linePoint,
  lineDirection,
  epsilon = 1e-9,
}: {
  point: Point3;
  linePoint: Point3;
  lineDirection: Point3;
  epsilon?: number;
}): number | null => {
  const lineDirectionLength = getPointLength3d(lineDirection);
  const candidate = subtractPoint3(point, linePoint);
  const candidateLength = getPointLength3d(candidate);
  if (lineDirectionLength <= epsilon || candidateLength <= epsilon) {
    return null;
  }

  const lineDirectionUnit = scalePoint3(lineDirection, 1 / lineDirectionLength);
  const candidateDirection = scalePoint3(candidate, 1 / candidateLength);
  return (
    (Math.asin(
      Math.min(1, Math.abs(dotPoint3(lineDirectionUnit, candidateDirection)))
    ) *
      180) /
    Math.PI
  );
};

export const isPointWithinPlaneOrthogonalToLineAngleTolerance3d = ({
  point,
  linePoint,
  lineDirection,
  toleranceDeg,
  epsilon = 1e-9,
}: {
  point: Point3;
  linePoint: Point3;
  lineDirection: Point3;
  toleranceDeg: number;
  epsilon?: number;
}): boolean => {
  const angleErrorDeg = getPointPlaneOrthogonalToLineAngleErrorDeg3d({
    point,
    linePoint,
    lineDirection,
    epsilon,
  });
  return angleErrorDeg !== null && angleErrorDeg <= Math.max(0, toleranceDeg);
};

export const projectPointOntoPlaneOrthogonalToLine3d = ({
  point,
  linePoint,
  lineDirection,
  epsilon = 1e-9,
}: {
  point: Point3;
  linePoint: Point3;
  lineDirection: Point3;
  epsilon?: number;
}): Point3 | null => {
  if (getPointLength3d(lineDirection) <= epsilon) {
    return null;
  }

  return projectPointOntoPlane3d({
    point,
    planeAnchor: linePoint,
    planeNormal: lineDirection,
    epsilon,
  });
};

export const arePoint3Close = (
  left: Point3,
  right: Point3,
  epsilon: number = 1e-9
): boolean =>
  Math.abs(left.x - right.x) <= epsilon &&
  Math.abs(left.y - right.y) <= epsilon &&
  Math.abs(left.z - right.z) <= epsilon;

export const getTriangleArea3d = ({
  a,
  b,
  c,
}: {
  a: Point3;
  b: Point3;
  c: Point3;
}): number =>
  getPointLength3d(crossPoint3(subtractPoint3(b, a), subtractPoint3(c, a))) *
  0.5;

export const getPolygonArea3d = (points: readonly Point3[]): number => {
  if (points.length < 3) {
    return 0;
  }

  const basePoint = points[0]!;
  let area = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const currentPoint = points[index];
    const nextPoint = points[index + 1];
    if (!currentPoint || !nextPoint) {
      continue;
    }

    area += getTriangleArea3d({
      a: basePoint,
      b: currentPoint,
      c: nextPoint,
    });
  }

  return Math.max(0, area);
};
