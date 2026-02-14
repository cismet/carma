import { Cartesian3 } from "@carma/cesium";

import type {
  PlanarPolygonGroup,
  PointDistanceRelation,
  PointMeasurementEntry,
} from "../types/MeasurementTypes";

export const REFERENCE_LINE_EPSILON_METERS = 0.001;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const isDistanceRelationVerticalLineVisible = (
  relation: PointDistanceRelation
) => relation.showVerticalLine ?? relation.showComponentLines ?? false;

export const isDistanceRelationHorizontalLineVisible = (
  relation: PointDistanceRelation
) => relation.showHorizontalLine ?? relation.showComponentLines ?? false;

export const hasVisibleDistanceRelationComponentLines = (
  relation: PointDistanceRelation
) =>
  isDistanceRelationVerticalLineVisible(relation) &&
  isDistanceRelationHorizontalLineVisible(relation);

export const getArcPointsInSpannedPlane = (
  auxiliaryPoint: Cartesian3,
  verticalTargetPoint: Cartesian3,
  horizontalTargetPoint: Cartesian3,
  arcRadiusMeters: number,
  segmentCount: number
): Cartesian3[] | null => {
  if (!Number.isFinite(arcRadiusMeters) || arcRadiusMeters <= 0) return null;

  const verticalVector = Cartesian3.subtract(
    verticalTargetPoint,
    auxiliaryPoint,
    new Cartesian3()
  );
  const horizontalVector = Cartesian3.subtract(
    horizontalTargetPoint,
    auxiliaryPoint,
    new Cartesian3()
  );
  const verticalLength = Cartesian3.magnitude(verticalVector);
  const horizontalLength = Cartesian3.magnitude(horizontalVector);

  if (verticalLength <= REFERENCE_LINE_EPSILON_METERS) return null;
  if (horizontalLength <= REFERENCE_LINE_EPSILON_METERS) return null;

  const verticalDirection = Cartesian3.normalize(
    verticalVector,
    new Cartesian3()
  );
  const horizontalDirectionRaw = Cartesian3.normalize(
    horizontalVector,
    new Cartesian3()
  );
  const dot = clamp(
    Cartesian3.dot(verticalDirection, horizontalDirectionRaw),
    -1,
    1
  );
  const angleRad = Math.acos(dot);
  if (!Number.isFinite(angleRad) || angleRad <= 1e-3) return null;

  const horizontalOrthogonal = Cartesian3.subtract(
    horizontalDirectionRaw,
    Cartesian3.multiplyByScalar(verticalDirection, dot, new Cartesian3()),
    new Cartesian3()
  );
  if (Cartesian3.magnitude(horizontalOrthogonal) <= 1e-5) return null;

  const horizontalDirection = Cartesian3.normalize(
    horizontalOrthogonal,
    new Cartesian3()
  );
  const safeRadius = Math.min(
    arcRadiusMeters,
    verticalLength * 0.999,
    horizontalLength * 0.999
  );
  if (safeRadius <= REFERENCE_LINE_EPSILON_METERS) return null;

  const points: Cartesian3[] = [];
  const segments = Math.max(8, segmentCount);
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const theta = angleRad * t;
    const direction = Cartesian3.add(
      Cartesian3.multiplyByScalar(
        verticalDirection,
        Math.cos(theta),
        new Cartesian3()
      ),
      Cartesian3.multiplyByScalar(
        horizontalDirection,
        Math.sin(theta),
        new Cartesian3()
      ),
      new Cartesian3()
    );
    const normalizedDirection = Cartesian3.normalize(
      direction,
      new Cartesian3()
    );
    points.push(
      Cartesian3.add(
        auxiliaryPoint,
        Cartesian3.multiplyByScalar(
          normalizedDirection,
          safeRadius,
          new Cartesian3()
        ),
        new Cartesian3()
      )
    );
  }

  return points.length >= 2 ? points : null;
};

export type ResolvedDistanceRelation = {
  relation: PointDistanceRelation;
  pointA: PointMeasurementEntry;
  pointB: PointMeasurementEntry;
  anchorPoint: PointMeasurementEntry;
  targetPoint: PointMeasurementEntry;
  auxiliaryPoint: Cartesian3;
};

export const resolveDistanceRelation = (
  relation: PointDistanceRelation,
  pointsById: Map<string, PointMeasurementEntry>
): ResolvedDistanceRelation | null => {
  const pointA = pointsById.get(relation.pointAId);
  const pointB = pointsById.get(relation.pointBId);
  if (!pointA || !pointB) return null;
  if (
    Cartesian3.distance(pointA.geometryECEF, pointB.geometryECEF) <=
    REFERENCE_LINE_EPSILON_METERS
  ) {
    return null;
  }

  const anchorPoint =
    relation.anchorPointId === pointB.id || relation.anchorPointId === pointA.id
      ? relation.anchorPointId === pointB.id
        ? pointB
        : pointA
      : pointA;
  const targetPoint = anchorPoint.id === pointA.id ? pointB : pointA;
  const auxiliaryPoint = Cartesian3.fromDegrees(
    anchorPoint.geometryWGS84.longitude,
    anchorPoint.geometryWGS84.latitude,
    targetPoint.geometryWGS84.height
  );

  return {
    relation,
    pointA,
    pointB,
    anchorPoint,
    targetPoint,
    auxiliaryPoint,
  };
};

export const normalizeLabelAngleDeg = (angleDeg: number) =>
  angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;

export type ScreenPoint2D = {
  x: number;
  y: number;
};

const isPointOnSegment2D = (
  point: ScreenPoint2D,
  start: ScreenPoint2D,
  end: ScreenPoint2D,
  tolerancePx = 1e-6
) => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const pointX = point.x - start.x;
  const pointY = point.y - start.y;
  const cross = Math.abs(segmentX * pointY - segmentY * pointX);
  if (cross > tolerancePx) return false;

  const dot = pointX * segmentX + pointY * segmentY;
  if (dot < -tolerancePx) return false;

  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (dot - segmentLengthSquared > tolerancePx) return false;

  return true;
};

const distancePointToSegment2D = (
  point: ScreenPoint2D,
  start: ScreenPoint2D,
  end: ScreenPoint2D
) => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared <= 1e-12) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection =
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
    segmentLengthSquared;
  const t = clamp(projection, 0, 1);
  const closestX = start.x + segmentX * t;
  const closestY = start.y + segmentY * t;
  return Math.hypot(point.x - closestX, point.y - closestY);
};

const closestPointOnSegment2D = (
  point: ScreenPoint2D,
  start: ScreenPoint2D,
  end: ScreenPoint2D
): ScreenPoint2D => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared <= 1e-12) {
    return { x: start.x, y: start.y };
  }

  const projection =
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
    segmentLengthSquared;
  const t = clamp(projection, 0, 1);
  return {
    x: start.x + segmentX * t,
    y: start.y + segmentY * t,
  };
};

export const isPointInsidePolygon2D = (
  polygonPoints: ScreenPoint2D[],
  point: ScreenPoint2D
) => {
  if (polygonPoints.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i) {
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

export const computePolygonArea2D = (points: ScreenPoint2D[]) => {
  if (points.length < 3) return 0;
  let areaAccumulator = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    areaAccumulator += current.x * next.y - next.x * current.y;
  }
  return Math.abs(areaAccumulator) * 0.5;
};

export const computeDistanceToPolygonEdges2D = (
  polygonPoints: ScreenPoint2D[],
  point: ScreenPoint2D
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

export const computePolygonCentroid2D = (
  points: ScreenPoint2D[]
) => {
  if (points.length < 3) return null;

  let signedArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    const cross = current.x * next.y - next.x * current.y;
    signedArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }

  signedArea *= 0.5;
  if (Math.abs(signedArea) <= 1e-6) {
    const avgX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const avgY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    return { x: avgX, y: avgY };
  }

  const factor = 1 / (6 * signedArea);
  return {
    x: centroidX * factor,
    y: centroidY * factor,
  };
};

export type LargestInscribedPoint2D = {
  center: ScreenPoint2D;
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
  polygonPoints: ScreenPoint2D[],
  point: ScreenPoint2D
) => {
  const distancePx = computeDistanceToPolygonEdges2D(polygonPoints, point);
  const isInside = isPointInsidePolygon2D(polygonPoints, point);
  return isInside ? distancePx : -distancePx;
};

const createPolylabelCell = (
  polygonPoints: ScreenPoint2D[],
  x: number,
  y: number,
  h: number
): PolylabelCell => {
  const d = computeSignedDistanceToPolygon2D(polygonPoints, { x, y });
  return {
    x,
    y,
    h,
    d,
    max: d + h * Math.SQRT2,
  };
};

const findInteriorSamplePoint2D = (
  polygonPoints: ScreenPoint2D[],
  gridResolution = 18
): LargestInscribedPoint2D | null => {
  if (polygonPoints.length < 3) return null;

  const minX = Math.min(...polygonPoints.map((point) => point.x));
  const maxX = Math.max(...polygonPoints.map((point) => point.x));
  const minY = Math.min(...polygonPoints.map((point) => point.y));
  const maxY = Math.max(...polygonPoints.map((point) => point.y));
  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) return null;

  const samplesPerAxis = Math.max(6, Math.floor(gridResolution));
  let bestPoint: ScreenPoint2D | null = null;
  let bestRadiusPx = Number.NEGATIVE_INFINITY;

  for (let row = 0; row <= samplesPerAxis; row += 1) {
    const tY = row / samplesPerAxis;
    const y = minY + height * tY;
    for (let col = 0; col <= samplesPerAxis; col += 1) {
      const tX = col / samplesPerAxis;
      const x = minX + width * tX;
      const candidate = { x, y };
      if (!isPointInsidePolygon2D(polygonPoints, candidate)) continue;
      const radiusPx = computeDistanceToPolygonEdges2D(polygonPoints, candidate);
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
  polygonPoints: ScreenPoint2D[]
): PolylabelCell | null => {
  const centroid = computePolygonCentroid2D(polygonPoints);
  if (!centroid) return null;
  return createPolylabelCell(polygonPoints, centroid.x, centroid.y, 0);
};

export const findLargestInscribedPoint2D = (
  polygonPoints: ScreenPoint2D[],
  precisionPx = 0.5,
  maxCellsToProcess = 20000
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
  if (cellSize <= 1e-6) return null;
  const h = cellSize / 2;

  const cellQueue: PolylabelCell[] = [];
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      cellQueue.push(createPolylabelCell(polygonPoints, x + h, y + h, h));
    }
  }

  let bestCell =
    computePolygonCentroidCell2D(polygonPoints) ??
    createPolylabelCell(
      polygonPoints,
      minX + width / 2,
      minY + height / 2,
      0
    );

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
      createPolylabelCell(polygonPoints, cell.x - childH, cell.y - childH, childH),
      createPolylabelCell(polygonPoints, cell.x + childH, cell.y - childH, childH),
      createPolylabelCell(polygonPoints, cell.x - childH, cell.y + childH, childH),
      createPolylabelCell(polygonPoints, cell.x + childH, cell.y + childH, childH)
    );
  }

  if (!Number.isFinite(bestCell.d) || bestCell.d <= 0) {
    return findInteriorSamplePoint2D(polygonPoints);
  }

  return {
    center: { x: bestCell.x, y: bestCell.y },
    radiusPx: Math.max(0, bestCell.d),
  };
};

export const coercePointInsidePolygon2D = (
  polygonPoints: ScreenPoint2D[],
  point: ScreenPoint2D,
  fallbackPoint?: ScreenPoint2D | null
): ScreenPoint2D | null => {
  if (polygonPoints.length < 3) return null;
  if (isPointInsidePolygon2D(polygonPoints, point)) return point;
  if (fallbackPoint && isPointInsidePolygon2D(polygonPoints, fallbackPoint)) {
    return fallbackPoint;
  }

  let nearestBoundaryPoint: ScreenPoint2D | null = null;
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
    if (directionLength > 1e-6) {
      const normX = directionX / directionLength;
      const normY = directionY / directionLength;
      const probeStepsPx = [0.5, 1, 2, 4, 8, 12, 16, 24, 32];
      for (const stepPx of probeStepsPx) {
        const candidate = {
          x: nearestBoundaryPoint.x + normX * stepPx,
          y: nearestBoundaryPoint.y + normY * stepPx,
        };
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
  bestAnchor: ScreenPoint2D | null;
};

export const computePolygonLabelFitMetrics = (
  polygonPoints: ScreenPoint2D[],
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
  const polygonAreaPx2 = computePolygonArea2D(polygonPoints);
  const safeLabelWidthPx = Math.max(
    1,
    Number.isFinite(labelWidthPx) ? labelWidthPx : 1
  );
  const safeLabelHeightPx = Math.max(
    1,
    Number.isFinite(labelHeightPx) ? labelHeightPx : 1
  );
  const labelAreaPx2 = safeLabelWidthPx * safeLabelHeightPx;
  const areaToLabelRatio = polygonAreaPx2 / labelAreaPx2;

  const largestInscribedPoint = findLargestInscribedPoint2D(polygonPoints);
  const fallbackCentroid = computePolygonCentroid2D(polygonPoints);
  const bestAnchorCandidate =
    largestInscribedPoint?.center ??
    (fallbackCentroid &&
    isPointInsidePolygon2D(polygonPoints, fallbackCentroid)
      ? fallbackCentroid
      : null) ??
    findInteriorSamplePoint2D(polygonPoints)?.center ??
    null;
  const bestAnchor = bestAnchorCandidate
    ? coercePointInsidePolygon2D(polygonPoints, bestAnchorCandidate)
    : null;
  const maxInscribedRadiusPx =
    largestInscribedPoint?.radiusPx ??
    (bestAnchor ? computeDistanceToPolygonEdges2D(polygonPoints, bestAnchor) : 0);

  const paddingX = 6;
  const paddingY = 4;
  const requiredRadiusPx = Math.hypot(
    safeLabelWidthPx * 0.5 + paddingX,
    safeLabelHeightPx * 0.5 + paddingY
  );

  return {
    polygonAreaPx2,
    labelAreaPx2,
    areaToLabelRatio,
    maxInscribedRadiusPx,
    requiredRadiusPx,
    fitsInsidePolygon:
      maxInscribedRadiusPx >= requiredRadiusPx && areaToLabelRatio >= 1.15,
    bestAnchor,
  };
};

export const getSplitMarkerRelationIdSet = (
  planarPolygonGroups: PlanarPolygonGroup[]
) => {
  const ids = new Set<string>();
  planarPolygonGroups.forEach((group) => {
    group.edgeRelationIds.forEach((edgeRelationId) => {
      ids.add(edgeRelationId);
    });
  });
  return ids;
};

export const getRoofRoofSharedEdgeRelationIdSet = (
  planarPolygonGroups: PlanarPolygonGroup[]
) => {
  const relationUsageCount = new Map<string, number>();
  const relationSurfaceTypes = new Map<string, Set<"roof" | "facade">>();

  planarPolygonGroups.forEach((group) => {
    const surfaceType = (group.surfaceType ?? "roof") as "roof" | "facade";
    group.edgeRelationIds.forEach((edgeRelationId) => {
      if (!edgeRelationId) return;
      relationUsageCount.set(
        edgeRelationId,
        (relationUsageCount.get(edgeRelationId) ?? 0) + 1
      );
      const surfaceTypes = relationSurfaceTypes.get(edgeRelationId);
      if (surfaceTypes) {
        surfaceTypes.add(surfaceType);
        return;
      }
      relationSurfaceTypes.set(edgeRelationId, new Set([surfaceType]));
    });
  });

  const hiddenLabelEdgeIds = new Set<string>();
  relationUsageCount.forEach((count, edgeRelationId) => {
    const surfaceTypes = relationSurfaceTypes.get(edgeRelationId);
    if (!surfaceTypes) return;
    if (count >= 2 && surfaceTypes.size === 1 && surfaceTypes.has("roof")) {
      hiddenLabelEdgeIds.add(edgeRelationId);
    }
  });

  return hiddenLabelEdgeIds;
};
