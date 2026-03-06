export type Point2 = {
  x: number;
  y: number;
};

export const getEquilateralTriangleHeight = (edgeLength: number): number =>
  (edgeLength * Math.sqrt(3)) / 2;

export const getEquilateralTrianglePathD = (edgeLength: number): string => {
  const height = getEquilateralTriangleHeight(edgeLength);
  return `M ${edgeLength / 2} 0 L 0 ${height} L ${edgeLength} ${height} Z`;
};

export const getEquilateralTriangleViewBox = (edgeLength: number): string =>
  `0 0 ${edgeLength} ${getEquilateralTriangleHeight(edgeLength)}`;

export const buildCirclePoints = (
  radiusPx: number,
  segments: number
): Point2[] =>
  Array.from({ length: segments }, (_, index) => {
    const t = (index / segments) * Math.PI * 2;
    return {
      x: Math.cos(t) * radiusPx,
      y: Math.sin(t) * radiusPx,
    };
  });

export const getSupportRadius2d = (points: Point2[]): number => {
  let maxProjectedRadius = 0;
  points.forEach((point) => {
    const d = Math.hypot(point.x, point.y);
    if (Number.isFinite(d) && d > maxProjectedRadius) {
      maxProjectedRadius = d;
    }
  });
  return maxProjectedRadius;
};
