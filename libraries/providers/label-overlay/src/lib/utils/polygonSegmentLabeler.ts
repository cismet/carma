import type { CssPixelPosition } from '@carma/units/types';

const MIN_SEGMENT_LENGTH_PX = 0.0001;
const MIN_SIGNED_AREA_TWICE = 0.000001;

export type PolygonSegmentLabelSide = 'inside' | 'outside';
export type PolygonSegmentLabelRotationMode = 'readable' | 'clockwise';
export type PolygonSegmentLabelWindingOrder = 'ccw' | 'cw';
export type PolygonSegmentLabelWindingPolicy =
  | 'respect-input'
  | 'enforce-ccw'
  | 'enforce-cw';

export type PolygonSegmentLabelPlacement = {
  segmentIndex: number;
  start: CssPixelPosition;
  end: CssPixelPosition;
  anchor: CssPixelPosition;
  rotationDeg: number;
  lineLengthPx: number;
  inputWindingOrder: PolygonSegmentLabelWindingOrder | null;
  resolvedWindingOrder: PolygonSegmentLabelWindingOrder;
  insideReferencePoint: CssPixelPosition;
  outsideReferencePoint: CssPixelPosition;
};

export type ComputePolygonSegmentLabelPlacementsOptions = {
  polygon: readonly CssPixelPosition[];
  closed?: boolean;
  side?: PolygonSegmentLabelSide;
  offsetPx?: number;
  rotationMode?: PolygonSegmentLabelRotationMode;
  windingPolicy?: PolygonSegmentLabelWindingPolicy;
  includeDegenerateSegments?: boolean;
};

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition['x'],
  y: y as CssPixelPosition['y'],
});

const normalizeAngleDeg = (angleDeg: number): number => {
  const normalized = angleDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const pointsEqual = (a: CssPixelPosition, b: CssPixelPosition): boolean =>
  a.x === b.x && a.y === b.y;

const normalizePolygonVertices = (
  polygon: readonly CssPixelPosition[]
): CssPixelPosition[] => {
  if (polygon.length < 2) {
    return [];
  }

  if (pointsEqual(polygon[0], polygon[polygon.length - 1])) {
    return polygon.slice(0, -1) as CssPixelPosition[];
  }

  return polygon.slice() as CssPixelPosition[];
};

const computeSignedAreaTwice = (
  polygon: readonly CssPixelPosition[]
): number => {
  if (polygon.length < 3) {
    return 0;
  }

  let areaTwice = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    areaTwice += current.x * next.y - next.x * current.y;
  }
  return areaTwice;
};

export const computePolygonScreenWindingOrder = (
  polygon: readonly CssPixelPosition[]
): PolygonSegmentLabelWindingOrder | null => {
  const vertices = normalizePolygonVertices(polygon);
  if (vertices.length < 3) {
    return null;
  }

  const signedAreaTwice = computeSignedAreaTwice(vertices);
  if (Math.abs(signedAreaTwice) <= MIN_SIGNED_AREA_TWICE) {
    return null;
  }
  return signedAreaTwice >= 0 ? 'ccw' : 'cw';
};

const resolveWindingOrder = ({
  inputWindingOrder,
  windingPolicy,
}: {
  inputWindingOrder: PolygonSegmentLabelWindingOrder | null;
  windingPolicy: PolygonSegmentLabelWindingPolicy;
}): PolygonSegmentLabelWindingOrder => {
  if (windingPolicy === 'enforce-cw') {
    return 'cw';
  }
  if (windingPolicy === 'enforce-ccw') {
    return 'ccw';
  }
  return inputWindingOrder ?? 'ccw';
};

const resolveReadableRotationDeg = ({
  dx,
  dy,
  lineLengthPx,
  normalX,
  normalY,
}: {
  dx: number;
  dy: number;
  lineLengthPx: number;
  normalX: number;
  normalY: number;
}): number => {
  if (lineLengthPx <= MIN_SEGMENT_LENGTH_PX) {
    return 0;
  }

  const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const lineUnitX = dx / lineLengthPx;
  const lineUnitY = dy / lineLengthPx;
  const crossProduct = lineUnitX * normalY - lineUnitY * normalX;
  const sideAdjustedAngle = crossProduct >= 0 ? rawAngleDeg : rawAngleDeg + 180;
  const normalizedAngle = normalizeAngleDeg(sideAdjustedAngle);
  return normalizedAngle > 90 && normalizedAngle < 270
    ? normalizeAngleDeg(normalizedAngle + 180)
    : normalizedAngle;
};

export const computePolygonSegmentLabelPlacements = ({
  polygon,
  closed = true,
  side = 'outside',
  offsetPx = 10,
  rotationMode = 'readable',
  windingPolicy = 'enforce-ccw',
  includeDegenerateSegments = false,
}: ComputePolygonSegmentLabelPlacementsOptions): PolygonSegmentLabelPlacement[] => {
  const vertices = normalizePolygonVertices(polygon);
  if (vertices.length < 2) {
    return [];
  }

  const segmentCount = closed ? vertices.length : vertices.length - 1;
  if (segmentCount <= 0) {
    return [];
  }

  const inputWindingOrder = computePolygonScreenWindingOrder(vertices);
  const resolvedWindingOrder = resolveWindingOrder({
    inputWindingOrder,
    windingPolicy,
  });
  const insideNormalSign = resolvedWindingOrder === 'ccw' ? 1 : -1;
  const placements: PolygonSegmentLabelPlacement[] = [];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const start = vertices[segmentIndex];
    const end = vertices[(segmentIndex + 1) % vertices.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lineLengthPx = Math.hypot(dx, dy);
    if (lineLengthPx <= MIN_SEGMENT_LENGTH_PX && !includeDegenerateSegments) {
      continue;
    }

    const midX = (start.x + end.x) * 0.5;
    const midY = (start.y + end.y) * 0.5;
    const leftNormalX =
      lineLengthPx <= MIN_SEGMENT_LENGTH_PX ? 0 : -dy / lineLengthPx;
    const leftNormalY =
      lineLengthPx <= MIN_SEGMENT_LENGTH_PX ? 0 : dx / lineLengthPx;
    const insideNormalX = leftNormalX * insideNormalSign;
    const insideNormalY = leftNormalY * insideNormalSign;
    const outsideNormalX = -insideNormalX;
    const outsideNormalY = -insideNormalY;
    const selectedNormalX = side === 'inside' ? insideNormalX : outsideNormalX;
    const selectedNormalY = side === 'inside' ? insideNormalY : outsideNormalY;
    const anchor = toCssPixelPosition(
      midX + selectedNormalX * offsetPx,
      midY + selectedNormalY * offsetPx
    );
    const insideReferencePoint = toCssPixelPosition(
      midX + insideNormalX * offsetPx,
      midY + insideNormalY * offsetPx
    );
    const outsideReferencePoint = toCssPixelPosition(
      midX + outsideNormalX * offsetPx,
      midY + outsideNormalY * offsetPx
    );
    const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const rotationDeg =
      rotationMode === 'clockwise'
        ? normalizeAngleDeg(rawAngleDeg)
        : resolveReadableRotationDeg({
            dx,
            dy,
            lineLengthPx,
            normalX: selectedNormalX,
            normalY: selectedNormalY,
          });

    placements.push({
      segmentIndex,
      start,
      end,
      anchor,
      rotationDeg,
      lineLengthPx,
      inputWindingOrder,
      resolvedWindingOrder,
      insideReferencePoint,
      outsideReferencePoint,
    });
  }

  return placements;
};
