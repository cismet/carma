import {
  addPoint2d,
  clamp,
  dotPoint2d,
  getPolygonArea2d,
  getPolygonCentroid2d,
  getSegmentFrame2d,
  scalePoint2d,
  subtractPoint2d,
} from "@carma-commons/math";
import { clampUnitRangeRatio, type CssPixelPosition } from "@carma-units";

const distanceScreenSpaceDefaults = (() => {
  const geometryEpsilonPx = 1e-6;
  const polygonAreaEpsilonPx2 = 1e-6;

  return Object.freeze({
    lineLengthEpsilonPx: 1e-3,
    referenceDistanceFactor: 0.2,
    flipThresholdPx: 4,
    referenceMinDistancePx: 24,
    referenceMaxDistancePx: 48,
    insideBlendFactor: 0.35,
    elevationEpsilonMeters: 0.001,
    geometryEpsilonPx,
    geometryEpsilonPxSquared: geometryEpsilonPx ** 2,
    polygonAreaEpsilonPx2,
    interiorSampleGridResolution: 18,
    minInteriorSampleGridResolution: 6,
    inwardProbeStepsPx: [0.5, 1, 2, 4, 8, 12, 16, 24, 32] as const,
    polygonLabelPaddingXPx: 6,
    polygonLabelPaddingYPx: 4,
    polygonLabelMinAreaToLabelRatio: 1.15,
    polylabelPrecisionPx: 0.5,
    polylabelMaxCellsToProcess: 20000,
    minSafeLabelDimensionPx: 1,
  });
})();
export type PointDistanceRelationLike = {
  showVerticalLine?: boolean;
  showHorizontalLine?: boolean;
  showComponentLines?: boolean;
};

export const isDistanceRelationVerticalLineVisible = (
  relation: PointDistanceRelationLike
) => relation.showVerticalLine ?? relation.showComponentLines ?? false;

export const isDistanceRelationHorizontalLineVisible = (
  relation: PointDistanceRelationLike
) => relation.showHorizontalLine ?? relation.showComponentLines ?? false;

export const hasVisibleDistanceRelationComponentLines = (
  relation: PointDistanceRelationLike
) =>
  isDistanceRelationVerticalLineVisible(relation) &&
  isDistanceRelationHorizontalLineVisible(relation);

export type DistanceScreenTriangle = {
  anchor: CssPixelPosition;
  target: CssPixelPosition;
  aux: CssPixelPosition;
  centroid: CssPixelPosition;
  highest: CssPixelPosition;
};

export type VerticalDistanceLineScreenData = {
  start: CssPixelPosition;
  end: CssPixelPosition;
  insideSign: -1 | 1;
  midX: number;
  midY: number;
  normalX: number;
  normalY: number;
  lineLength: number;
};

const resolveStableSideSign = (
  signedDistance: number,
  previousSign: -1 | 1 | undefined,
  flipThresholdPx: number = distanceScreenSpaceDefaults.flipThresholdPx
): -1 | 1 => {
  if (!Number.isFinite(signedDistance)) return previousSign ?? 1;
  const nextSign: -1 | 1 = signedDistance >= 0 ? 1 : -1;
  if (!previousSign || previousSign === nextSign) return nextSign;
  if (Math.abs(signedDistance) < flipThresholdPx) return previousSign;
  return nextSign;
};

export const buildOutsideReferencePoint2D = (
  start: CssPixelPosition,
  end: CssPixelPosition,
  insidePoint: CssPixelPosition,
  minDistancePx = distanceScreenSpaceDefaults.referenceMinDistancePx,
  maxDistancePx = distanceScreenSpaceDefaults.referenceMaxDistancePx
): CssPixelPosition | null => {
  const edgeFrame = getSegmentFrame2d({
    start,
    end,
    epsilon: distanceScreenSpaceDefaults.lineLengthEpsilonPx,
  });
  if (!edgeFrame) {
    return null;
  }

  const insideOffset = subtractPoint2d(insidePoint, edgeFrame.midpoint);
  const insideProjection = dotPoint2d(insideOffset, edgeFrame.leftUnitNormal);
  const insideSign = insideProjection >= 0 ? 1 : -1;
  const referenceDistancePx = clamp(
    edgeFrame.length * distanceScreenSpaceDefaults.referenceDistanceFactor,
    minDistancePx,
    maxDistancePx
  );
  const referenceOffset = scalePoint2d(
    edgeFrame.leftUnitNormal,
    insideSign * referenceDistancePx
  );

  return addPoint2d(edgeFrame.midpoint, referenceOffset) as CssPixelPosition;
};

export const buildDistanceTriangleInsidePoint2D = ({
  triangle,
  auxiliaryAltitudeMeters,
  highestAltitudeMeters,
  insideBlendFactor = distanceScreenSpaceDefaults.insideBlendFactor,
  elevationEpsilonMeters = distanceScreenSpaceDefaults.elevationEpsilonMeters,
}: {
  triangle: DistanceScreenTriangle;
  auxiliaryAltitudeMeters: number;
  highestAltitudeMeters: number;
  insideBlendFactor?: number;
  elevationEpsilonMeters?: number;
}): CssPixelPosition => {
  const elevationDriverPoint =
    auxiliaryAltitudeMeters < highestAltitudeMeters - elevationEpsilonMeters
      ? triangle.highest
      : triangle.aux;
  return {
    x:
      elevationDriverPoint.x +
      (triangle.centroid.x - elevationDriverPoint.x) * insideBlendFactor,
    y:
      elevationDriverPoint.y +
      (triangle.centroid.y - elevationDriverPoint.y) * insideBlendFactor,
  } as CssPixelPosition;
};

export const buildVerticalDistanceLineScreenData = ({
  triangle,
  previousInsideSign,
  flipThresholdPx = distanceScreenSpaceDefaults.flipThresholdPx,
}: {
  triangle: DistanceScreenTriangle;
  previousInsideSign?: -1 | 1;
  flipThresholdPx?: number;
}): VerticalDistanceLineScreenData | null => {
  let start = triangle.anchor;
  let end = triangle.aux;
  const inside = triangle.target;

  const computeEdgeMetrics = (
    nextStart: CssPixelPosition,
    nextEnd: CssPixelPosition
  ): {
    midX: number;
    midY: number;
    normalX: number;
    normalY: number;
    lineLength: number;
    insideDot: number;
  } | null => {
    const edgeFrame = getSegmentFrame2d({
      start: nextStart,
      end: nextEnd,
      epsilon: distanceScreenSpaceDefaults.lineLengthEpsilonPx,
    });
    if (!edgeFrame) {
      return null;
    }

    const insideOffset = subtractPoint2d(inside, edgeFrame.midpoint);
    const insideDot = dotPoint2d(insideOffset, edgeFrame.leftUnitNormal);

    return {
      midX: edgeFrame.midpoint.x,
      midY: edgeFrame.midpoint.y,
      normalX: edgeFrame.leftUnitNormal.x,
      normalY: edgeFrame.leftUnitNormal.y,
      lineLength: edgeFrame.length,
      insideDot,
    };
  };

  let edge = computeEdgeMetrics(start, end);
  if (!edge) return null;

  const insideSign = resolveStableSideSign(
    edge.insideDot,
    previousInsideSign,
    flipThresholdPx
  );

  if (insideSign < 0) {
    start = triangle.aux;
    end = triangle.anchor;
    edge = computeEdgeMetrics(start, end);
    if (!edge) return null;
  }

  return {
    start,
    end,
    insideSign,
    midX: edge.midX,
    midY: edge.midY,
    normalX: edge.normalX,
    normalY: edge.normalY,
    lineLength: edge.lineLength,
  };
};

export const buildVerticalLabelReferencePoint2D = (
  edge: VerticalDistanceLineScreenData,
  minDistancePx = distanceScreenSpaceDefaults.referenceMinDistancePx,
  maxDistancePx = distanceScreenSpaceDefaults.referenceMaxDistancePx
): CssPixelPosition => {
  const referenceDistancePx = clamp(
    edge.lineLength * distanceScreenSpaceDefaults.referenceDistanceFactor,
    minDistancePx,
    maxDistancePx
  );
  const edgeMidpoint = { x: edge.midX, y: edge.midY };
  const edgeNormal = { x: edge.normalX, y: edge.normalY };
  const referenceOffset = scalePoint2d(
    edgeNormal,
    edge.insideSign * referenceDistancePx
  );

  return addPoint2d(edgeMidpoint, referenceOffset) as CssPixelPosition;
};

const isPointOnSegment2D = (
  point: CssPixelPosition,
  start: CssPixelPosition,
  end: CssPixelPosition,
  tolerancePx = distanceScreenSpaceDefaults.geometryEpsilonPx
) => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const pointX = point.x - start.x;
  const pointY = point.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (
    segmentLengthSquared <= distanceScreenSpaceDefaults.geometryEpsilonPxSquared
  ) {
    return Math.hypot(pointX, pointY) <= tolerancePx;
  }

  const segmentLength = Math.sqrt(segmentLengthSquared);
  const signedDistanceFromLinePx =
    Math.abs(segmentX * pointY - segmentY * pointX) / segmentLength;
  if (signedDistanceFromLinePx > tolerancePx) return false;

  const alongDistancePx =
    (pointX * segmentX + pointY * segmentY) / segmentLength;
  if (alongDistancePx < -tolerancePx) return false;
  if (alongDistancePx - segmentLength > tolerancePx) return false;

  return true;
};

const distancePointToSegment2D = (
  point: CssPixelPosition,
  start: CssPixelPosition,
  end: CssPixelPosition
) => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (
    segmentLengthSquared <=
    distanceScreenSpaceDefaults.geometryEpsilonPxSquared
  ) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection =
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
    segmentLengthSquared;
  const t = clampUnitRangeRatio(projection);
  const closestX = start.x + segmentX * t;
  const closestY = start.y + segmentY * t;
  return Math.hypot(point.x - closestX, point.y - closestY);
};

const closestPointOnSegment2D = (
  point: CssPixelPosition,
  start: CssPixelPosition,
  end: CssPixelPosition
): CssPixelPosition => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (
    segmentLengthSquared <=
    distanceScreenSpaceDefaults.geometryEpsilonPxSquared
  ) {
    return { x: start.x, y: start.y } as CssPixelPosition;
  }

  const projection =
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
    segmentLengthSquared;
  const t = clampUnitRangeRatio(projection);
  return {
    x: start.x + segmentX * t,
    y: start.y + segmentY * t,
  } as CssPixelPosition;
};

export const isPointInsidePolygon2D = (
  polygonPoints: CssPixelPosition[],
  point: CssPixelPosition
) => {
  if (polygonPoints.length < 3) return false;

  let inside = false;
  for (
    let i = 0, j = polygonPoints.length - 1;
    i < polygonPoints.length;
    j = i
  ) {
    const current = polygonPoints[i];
    const previous = polygonPoints[j];
    if (!current || !previous) continue;

    if (isPointOnSegment2D(point, previous, current)) {
      return true;
    }

    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y + Number.EPSILON) +
          current.x;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
};

export const computeDistanceToPolygonEdges2D = (
  polygonPoints: CssPixelPosition[],
  point: CssPixelPosition
) => {
  if (polygonPoints.length < 2) return 0;

  let minDistancePx = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygonPoints.length; i += 1) {
    const start = polygonPoints[i];
    const end = polygonPoints[(i + 1) % polygonPoints.length];
    if (!start || !end) continue;
    const distance = distancePointToSegment2D(point, start, end);
    if (distance < minDistancePx) {
      minDistancePx = distance;
    }
  }

  return Number.isFinite(minDistancePx) ? minDistancePx : 0;
};

export const computePolygonCentroid2D = (points: CssPixelPosition[]) =>
  getPolygonCentroid2d({
    points,
    degenerateAreaEpsilon: distanceScreenSpaceDefaults.polygonAreaEpsilonPx2,
  }) as CssPixelPosition | null;

export type LargestInscribedPoint2D = {
  center: CssPixelPosition;
  radiusPx: number;
};

type PolylabelCell = {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
};

const computeSignedDistanceToPolygon2D = (
  polygonPoints: CssPixelPosition[],
  point: CssPixelPosition
) => {
  const distancePx = computeDistanceToPolygonEdges2D(polygonPoints, point);
  const isInside = isPointInsidePolygon2D(polygonPoints, point);
  return isInside ? distancePx : -distancePx;
};

const createPolylabelCell = (
  polygonPoints: CssPixelPosition[],
  x: number,
  y: number,
  h: number
): PolylabelCell => {
  const d = computeSignedDistanceToPolygon2D(polygonPoints, {
    x,
    y,
  } as CssPixelPosition);
  return {
    x,
    y,
    h,
    d,
    max: d + h * Math.SQRT2,
  };
};

const findInteriorSamplePoint2D = (
  polygonPoints: CssPixelPosition[],
  gridResolution = distanceScreenSpaceDefaults.interiorSampleGridResolution
): LargestInscribedPoint2D | null => {
  if (polygonPoints.length < 3) return null;

  const minX = Math.min(...polygonPoints.map((point) => point.x));
  const maxX = Math.max(...polygonPoints.map((point) => point.x));
  const minY = Math.min(...polygonPoints.map((point) => point.y));
  const maxY = Math.max(...polygonPoints.map((point) => point.y));
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) return null;

  const samplesPerAxis = Math.max(
    distanceScreenSpaceDefaults.minInteriorSampleGridResolution,
    Math.floor(gridResolution)
  );
  let bestPoint: CssPixelPosition | null = null;
  let bestRadiusPx = Number.NEGATIVE_INFINITY;

  for (let row = 0; row <= samplesPerAxis; row += 1) {
    const tY = row / samplesPerAxis;
    const y = minY + height * tY;
    for (let col = 0; col <= samplesPerAxis; col += 1) {
      const tX = col / samplesPerAxis;
      const x = minX + width * tX;
      const candidate = { x, y } as CssPixelPosition;
      if (!isPointInsidePolygon2D(polygonPoints, candidate)) continue;
      const radiusPx = computeDistanceToPolygonEdges2D(
        polygonPoints,
        candidate
      );
      if (radiusPx > bestRadiusPx) {
        bestRadiusPx = radiusPx;
        bestPoint = candidate;
      }
    }
  }

  if (!bestPoint || !Number.isFinite(bestRadiusPx) || bestRadiusPx < 0) {
    return null;
  }

  return {
    center: bestPoint,
    radiusPx: bestRadiusPx,
  };
};

const computePolygonCentroidCell2D = (
  polygonPoints: CssPixelPosition[]
): PolylabelCell | null => {
  const centroid = computePolygonCentroid2D(polygonPoints);
  if (!centroid) return null;
  return createPolylabelCell(polygonPoints, centroid.x, centroid.y, 0);
};

export const findLargestInscribedPoint2D = (
  polygonPoints: CssPixelPosition[],
  precisionPx = distanceScreenSpaceDefaults.polylabelPrecisionPx,
  maxCellsToProcess = distanceScreenSpaceDefaults.polylabelMaxCellsToProcess
): LargestInscribedPoint2D | null => {
  if (polygonPoints.length < 3) return null;
  if (
    polygonPoints.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
    )
  ) {
    return null;
  }

  const minX = Math.min(...polygonPoints.map((point) => point.x));
  const maxX = Math.max(...polygonPoints.map((point) => point.x));
  const minY = Math.min(...polygonPoints.map((point) => point.y));
  const maxY = Math.max(...polygonPoints.map((point) => point.y));

  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) return null;
  const cellSize = Math.min(width, height);
  if (cellSize <= distanceScreenSpaceDefaults.geometryEpsilonPx) {
    return null;
  }
  const h = cellSize / 2;

  const cellQueue: PolylabelCell[] = [];
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      cellQueue.push(createPolylabelCell(polygonPoints, x + h, y + h, h));
    }
  }

  let bestCell =
    computePolygonCentroidCell2D(polygonPoints) ??
    createPolylabelCell(polygonPoints, minX + width / 2, minY + height / 2, 0);

  const bboxCell = createPolylabelCell(
    polygonPoints,
    minX + width / 2,
    minY + height / 2,
    0
  );
  if (bboxCell.d > bestCell.d) {
    bestCell = bboxCell;
  }

  const precision = Math.max(0.1, precisionPx);
  let processedCells = 0;
  while (cellQueue.length > 0 && processedCells < maxCellsToProcess) {
    let mostPromisingIndex = 0;
    for (let i = 1; i < cellQueue.length; i += 1) {
      if (cellQueue[i].max > cellQueue[mostPromisingIndex].max) {
        mostPromisingIndex = i;
      }
    }
    const [cell] = cellQueue.splice(mostPromisingIndex, 1);
    if (!cell) break;
    processedCells += 1;

    if (cell.d > bestCell.d) {
      bestCell = cell;
    }

    if (cell.max - bestCell.d <= precision) {
      continue;
    }

    const childH = cell.h / 2;
    cellQueue.push(
      createPolylabelCell(
        polygonPoints,
        cell.x - childH,
        cell.y - childH,
        childH
      ),
      createPolylabelCell(
        polygonPoints,
        cell.x + childH,
        cell.y - childH,
        childH
      ),
      createPolylabelCell(
        polygonPoints,
        cell.x - childH,
        cell.y + childH,
        childH
      ),
      createPolylabelCell(
        polygonPoints,
        cell.x + childH,
        cell.y + childH,
        childH
      )
    );
  }

  if (!Number.isFinite(bestCell.d) || bestCell.d <= 0) {
    return findInteriorSamplePoint2D(polygonPoints);
  }

  return {
    center: { x: bestCell.x, y: bestCell.y } as CssPixelPosition,
    radiusPx: Math.max(0, bestCell.d),
  };
};

export const coercePointInsidePolygon2D = (
  polygonPoints: CssPixelPosition[],
  point: CssPixelPosition,
  fallbackPoint?: CssPixelPosition | null
): CssPixelPosition | null => {
  if (polygonPoints.length < 3) return null;
  if (isPointInsidePolygon2D(polygonPoints, point)) return point;
  if (fallbackPoint && isPointInsidePolygon2D(polygonPoints, fallbackPoint)) {
    return fallbackPoint;
  }

  let nearestBoundaryPoint: CssPixelPosition | null = null;
  let nearestDistancePx = Number.POSITIVE_INFINITY;

  for (let i = 0; i < polygonPoints.length; i += 1) {
    const start = polygonPoints[i];
    const end = polygonPoints[(i + 1) % polygonPoints.length];
    if (!start || !end) continue;
    const candidate = closestPointOnSegment2D(point, start, end);
    const distancePx = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distancePx < nearestDistancePx) {
      nearestDistancePx = distancePx;
      nearestBoundaryPoint = candidate;
    }
  }

  const centroid = computePolygonCentroid2D(polygonPoints);
  const inscribed = findLargestInscribedPoint2D(polygonPoints);
  const inwardTarget =
    (centroid && isPointInsidePolygon2D(polygonPoints, centroid)
      ? centroid
      : null) ??
    fallbackPoint ??
    inscribed?.center ??
    null;

  if (nearestBoundaryPoint && inwardTarget) {
    const directionX = inwardTarget.x - nearestBoundaryPoint.x;
    const directionY = inwardTarget.y - nearestBoundaryPoint.y;
    const directionLength = Math.hypot(directionX, directionY);
    if (directionLength > distanceScreenSpaceDefaults.geometryEpsilonPx) {
      const normX = directionX / directionLength;
      const normY = directionY / directionLength;
      for (const stepPx of distanceScreenSpaceDefaults.inwardProbeStepsPx) {
        const candidate = {
          x: nearestBoundaryPoint.x + normX * stepPx,
          y: nearestBoundaryPoint.y + normY * stepPx,
        } as CssPixelPosition;
        if (isPointInsidePolygon2D(polygonPoints, candidate)) {
          return candidate;
        }
      }
    }
  }

  if (centroid && isPointInsidePolygon2D(polygonPoints, centroid)) {
    return centroid;
  }
  if (inscribed?.center) {
    return inscribed.center;
  }
  const sampled = findInteriorSamplePoint2D(polygonPoints);
  return sampled?.center ?? null;
};

export type PolygonLabelFitMetrics = {
  polygonAreaPx2: number;
  labelAreaPx2: number;
  areaToLabelRatio: number;
  maxInscribedRadiusPx: number;
  requiredRadiusPx: number;
  fitsInsidePolygon: boolean;
  bestAnchor: CssPixelPosition | null;
};

export const computePolygonLabelFitMetrics = (
  polygonPoints: CssPixelPosition[],
  labelWidthPx: number,
  labelHeightPx: number
): PolygonLabelFitMetrics => {
  if (
    polygonPoints.length < 3 ||
    polygonPoints.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)
    )
  ) {
    return {
      polygonAreaPx2: 0,
      labelAreaPx2: 0,
      areaToLabelRatio: 0,
      maxInscribedRadiusPx: 0,
      requiredRadiusPx: 0,
      fitsInsidePolygon: false,
      bestAnchor: null,
    };
  }
  const polygonAreaPx2 = getPolygonArea2d(polygonPoints);
  const safeLabelWidthPx = Math.max(
    distanceScreenSpaceDefaults.minSafeLabelDimensionPx,
    Number.isFinite(labelWidthPx)
      ? labelWidthPx
      : distanceScreenSpaceDefaults.minSafeLabelDimensionPx
  );
  const safeLabelHeightPx = Math.max(
    distanceScreenSpaceDefaults.minSafeLabelDimensionPx,
    Number.isFinite(labelHeightPx)
      ? labelHeightPx
      : distanceScreenSpaceDefaults.minSafeLabelDimensionPx
  );
  const labelAreaPx2 = safeLabelWidthPx * safeLabelHeightPx;
  const areaToLabelRatio = polygonAreaPx2 / labelAreaPx2;

  const largestInscribedPoint = findLargestInscribedPoint2D(polygonPoints);
  const fallbackCentroid = computePolygonCentroid2D(polygonPoints);
  const bestAnchorCandidate =
    largestInscribedPoint?.center ??
    (fallbackCentroid && isPointInsidePolygon2D(polygonPoints, fallbackCentroid)
      ? fallbackCentroid
      : null) ??
    findInteriorSamplePoint2D(polygonPoints)?.center ??
    null;
  const bestAnchor = bestAnchorCandidate
    ? coercePointInsidePolygon2D(polygonPoints, bestAnchorCandidate)
    : null;
  const maxInscribedRadiusPx =
    largestInscribedPoint?.radiusPx ??
    (bestAnchor
      ? computeDistanceToPolygonEdges2D(polygonPoints, bestAnchor)
      : 0);

  const requiredRadiusPx = Math.hypot(
    safeLabelWidthPx * 0.5 + distanceScreenSpaceDefaults.polygonLabelPaddingXPx,
    safeLabelHeightPx * 0.5 +
      distanceScreenSpaceDefaults.polygonLabelPaddingYPx
  );

  return {
    polygonAreaPx2,
    labelAreaPx2,
    areaToLabelRatio,
    maxInscribedRadiusPx,
    requiredRadiusPx,
    fitsInsidePolygon:
      maxInscribedRadiusPx >= requiredRadiusPx &&
      areaToLabelRatio >= distanceScreenSpaceDefaults.polygonLabelMinAreaToLabelRatio,
    bestAnchor,
  };
};
