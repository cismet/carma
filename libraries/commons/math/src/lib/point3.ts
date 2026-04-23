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

export const crossPoint3 = (left: Point3, right: Point3): Point3 => ({
  x: left.y * right.z - left.z * right.y,
  y: left.z * right.x - left.x * right.z,
  z: left.x * right.y - left.y * right.x,
});

export const getPointLength3d = (point: Point3): number =>
  Math.hypot(point.x, point.y, point.z);

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
