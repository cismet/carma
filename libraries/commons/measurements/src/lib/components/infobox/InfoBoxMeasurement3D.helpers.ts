import {
  Cartesian3,
  Cartesian4,
  Ellipsoid,
  Matrix4,
  Transforms,
} from "@carma/cesium";
import { formatNumber } from "@carma-mapping/engines/cesium/measurements";
import type { PolylineSegmentLineMode } from "../../types/measurementTypes";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  PURE_LABEL_DEFAULT_FONT_SIZE_PX,
  PURE_LABEL_MAX_FONT_SIZE_PX,
  PURE_LABEL_MIN_FONT_SIZE_PX,
} from "./InfoBoxMeasurement3D.config";

const PLANE_HORIZONTAL_PROJECTION_EPSILON = 1e-6;
const PLANE_VERTICAL_TILT_EPSILON_DEG = 0.1;

const ELEVATION_MAX_RESOLUTION_DECIMALS = 2;
const ELEVATION_INPUT_MIN_WIDTH_PX = 76;
const ELEVATION_INPUT_MAX_WIDTH_PX = 126;
const ELEVATION_INPUT_CHARACTER_WIDTH_PX = 8;
const ELEVATION_INPUT_CONTROLS_PADDING_PX = 34;
const DEFAULT_SIGNIFICANT_DIGITS = 3;
const MOVE_GIZMO_VERTICAL_AXIS_COLOR = "rgba(59, 130, 246, 0.98)";
const MOVE_GIZMO_HORIZONTAL_PRIMARY_AXIS_COLOR = "rgba(239, 68, 68, 0.98)";
const MOVE_GIZMO_HORIZONTAL_SECONDARY_AXIS_COLOR = "rgba(34, 197, 94, 0.98)";
const MOVE_GIZMO_RELATION_AXIS_COLOR = "rgba(148, 163, 184, 0.98)";
const AXIS_DIRECTION_EPSILON = 1e-8;

export type DistanceRelationLineVisibility = {
  direct: boolean;
  vertical: boolean;
  horizontal: boolean;
};

export type RelationMoveAxisCandidate = {
  id: string;
  direction: Cartesian3;
  color: string;
  title: string;
};

type DistanceRelationLike = {
  showDirectLine?: boolean;
  showVerticalLine?: boolean;
  showHorizontalLine?: boolean;
  showComponentLines?: boolean;
};

type PolygonSurfaceType = "roof" | "facade" | "terrain" | "footprint";

export type PolygonGroupLike = {
  id: string;
  name?: string;
  vertexPointIds: string[];
  edgeRelationIds: string[];
  closed?: boolean;
  segmentLineMode?: PolylineSegmentLineMode;
  areaSquareMeters?: number;
  verticalityDeg?: number;
  surfaceType?: PolygonSurfaceType;
  plane?: PolygonPlaneLike;
};

type PolygonPlaneLike = {
  anchorECEF: { x: number; y: number; z: number };
  normalECEF: { x: number; y: number; z: number };
};

export const getMeasurementEdgeId = (pointAId: string, pointBId: string) => {
  const [left, right] = [pointAId, pointBId].sort((a, b) => a.localeCompare(b));
  return `edge:${left}:${right}`;
};

export const formatSignificant = (
  value: number,
  significantDigits = DEFAULT_SIGNIFICANT_DIGITS
) => {
  if (!Number.isFinite(value)) return "0";
  const absolute = Math.abs(value);
  if (absolute === 0) return "0";
  const digitsBeforeDecimal = Math.floor(Math.log10(absolute)) + 1;
  const fractionDigits = Math.max(0, significantDigits - digitsBeforeDecimal);
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
};

const normalizeDegrees0To360 = (degrees: number) => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const getGermanCardinalDirectionFromAzimuth = (azimuthDeg: number) => {
  const directionLabels = [
    "Nord",
    "Nordost",
    "Ost",
    "Südost",
    "Süd",
    "Südwest",
    "West",
    "Nordwest",
  ];
  const index = Math.round(normalizeDegrees0To360(azimuthDeg) / 45) % 8;
  return directionLabels[index] ?? "N";
};

const formatCardinalBearingVsNorth = (azimuthDeg: number) => {
  const normalizedAzimuthDeg = normalizeDegrees0To360(azimuthDeg);
  const cardinalDirection =
    getGermanCardinalDirectionFromAzimuth(normalizedAzimuthDeg);
  return `${cardinalDirection} (${formatNumber(
    normalizedAzimuthDeg
  )}° ggü. Nord)`;
};

export const getDistanceRelationId = (pointAId: string, pointBId: string) => {
  const [left, right] = [pointAId, pointBId].sort((a, b) => a.localeCompare(b));
  return `distance-relation:${left}:${right}`;
};

export const getDistanceRelationLineVisibilityByKind = (
  relation: DistanceRelationLike
): DistanceRelationLineVisibility => ({
  direct: relation.showDirectLine ?? false,
  vertical: relation.showVerticalLine ?? relation.showComponentLines ?? false,
  horizontal:
    relation.showHorizontalLine ?? relation.showComponentLines ?? false,
});

export const sanitizePureLabelFontSizePx = (value?: number): number => {
  if (!Number.isFinite(value)) return PURE_LABEL_DEFAULT_FONT_SIZE_PX;
  const normalized = Math.round(Number(value));
  return Math.min(
    PURE_LABEL_MAX_FONT_SIZE_PX,
    Math.max(PURE_LABEL_MIN_FONT_SIZE_PX, normalized)
  );
};

export const buildRelationMoveAxisCandidates = (
  currentPointEcef: Cartesian3,
  relatedPointEcef: Cartesian3
): RelationMoveAxisCandidate[] => {
  const relatedToCurrentVector = Cartesian3.subtract(
    currentPointEcef,
    relatedPointEcef,
    new Cartesian3()
  );

  const currentPointEnuTransform = Transforms.eastNorthUpToFixedFrame(
    currentPointEcef,
    Ellipsoid.WGS84
  );
  const currentEastAxis = Matrix4.getColumn(
    currentPointEnuTransform,
    0,
    new Cartesian4()
  );
  const currentEastVector = Cartesian3.normalize(
    new Cartesian3(currentEastAxis.x, currentEastAxis.y, currentEastAxis.z),
    new Cartesian3()
  );
  const currentNorthAxis = Matrix4.getColumn(
    currentPointEnuTransform,
    1,
    new Cartesian4()
  );
  const currentNorthVector = Cartesian3.normalize(
    new Cartesian3(currentNorthAxis.x, currentNorthAxis.y, currentNorthAxis.z),
    new Cartesian3()
  );
  const currentUpAxis = Matrix4.getColumn(
    currentPointEnuTransform,
    2,
    new Cartesian4()
  );
  const currentUpVector = Cartesian3.normalize(
    new Cartesian3(currentUpAxis.x, currentUpAxis.y, currentUpAxis.z),
    new Cartesian3()
  );

  const upProjection = Cartesian3.multiplyByScalar(
    currentUpVector,
    Cartesian3.dot(relatedToCurrentVector, currentUpVector),
    new Cartesian3()
  );
  const horizontalProjection = Cartesian3.subtract(
    relatedToCurrentVector,
    upProjection,
    new Cartesian3()
  );
  const horizontalAxisDirection =
    Cartesian3.magnitudeSquared(horizontalProjection) > AXIS_DIRECTION_EPSILON
      ? Cartesian3.normalize(horizontalProjection, new Cartesian3())
      : currentEastVector;

  const orthogonalHorizontalAxisRaw = Cartesian3.cross(
    currentUpVector,
    horizontalAxisDirection,
    new Cartesian3()
  );
  const orthogonalHorizontalAxisDirection =
    Cartesian3.magnitudeSquared(orthogonalHorizontalAxisRaw) >
    AXIS_DIRECTION_EPSILON
      ? Cartesian3.normalize(orthogonalHorizontalAxisRaw, new Cartesian3())
      : currentNorthVector;

  const directAxisDirection =
    Cartesian3.magnitudeSquared(relatedToCurrentVector) > AXIS_DIRECTION_EPSILON
      ? Cartesian3.normalize(relatedToCurrentVector, new Cartesian3())
      : horizontalAxisDirection;

  return [
    {
      id: "vertical",
      direction: currentUpVector,
      color: MOVE_GIZMO_VERTICAL_AXIS_COLOR,
      title: "Punkt entlang der U-Achse verschieben",
    },
    {
      id: "horizontal",
      direction: horizontalAxisDirection,
      color: MOVE_GIZMO_HORIZONTAL_PRIMARY_AXIS_COLOR,
      title: "Punkt entlang der horizontalen Komponente verschieben",
    },
    {
      id: "horizontal-orthogonal",
      direction: orthogonalHorizontalAxisDirection,
      color: MOVE_GIZMO_HORIZONTAL_SECONDARY_AXIS_COLOR,
      title: "Punkt entlang der orthogonalen Horizontalachse verschieben",
    },
    {
      id: "direct",
      direction: directAxisDirection,
      color: MOVE_GIZMO_RELATION_AXIS_COLOR,
      title: "Punkt entlang der direkten Distanz verschieben",
    },
  ];
};

export const stopEventPropagation = (event: ReactMouseEvent<HTMLElement>) => {
  event.stopPropagation();
};

export const computeHorizontalAreaAtLowestElevation = (
  verticesECEF: Cartesian3[]
): number => {
  if (verticesECEF.length < 3) return 0;

  const ellipsoid = Ellipsoid.WGS84;
  const cartographics = verticesECEF
    .map((vertex) => ellipsoid.cartesianToCartographic(vertex))
    .filter((cartographic): cartographic is NonNullable<typeof cartographic> =>
      Boolean(cartographic)
    );
  if (cartographics.length < 3) return 0;

  let lowestIndex = 0;
  for (let index = 1; index < cartographics.length; index += 1) {
    if (
      (cartographics[index]?.height ?? Number.POSITIVE_INFINITY) <
      (cartographics[lowestIndex]?.height ?? Number.POSITIVE_INFINITY)
    ) {
      lowestIndex = index;
    }
  }

  const lowest = cartographics[lowestIndex];
  if (!lowest) return 0;
  const lowestHeight = lowest.height;
  const anchor = Cartesian3.fromRadians(
    lowest.longitude,
    lowest.latitude,
    lowestHeight
  );
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, ellipsoid);
  const east4 = Matrix4.getColumn(enuFrame, 0, new Cartesian4());
  const north4 = Matrix4.getColumn(enuFrame, 1, new Cartesian4());
  const east = Cartesian3.normalize(
    new Cartesian3(east4.x, east4.y, east4.z),
    new Cartesian3()
  );
  const north = Cartesian3.normalize(
    new Cartesian3(north4.x, north4.y, north4.z),
    new Cartesian3()
  );

  const coords = cartographics.map((cartographic) => {
    const auxiliaryPoint = Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      lowestHeight
    );
    const delta = Cartesian3.subtract(auxiliaryPoint, anchor, new Cartesian3());
    return {
      x: Cartesian3.dot(delta, east),
      y: Cartesian3.dot(delta, north),
    };
  });

  let shoelace = 0;
  for (let index = 0; index < coords.length; index += 1) {
    const current = coords[index];
    const next = coords[(index + 1) % coords.length];
    if (!current || !next) continue;
    shoelace += current.x * next.y - current.y * next.x;
  }
  return Math.abs(shoelace) * 0.5;
};

export const getPolygonTiltAndNormalDirection = (plane?: PolygonPlaneLike) => {
  if (!plane) {
    return {
      tiltDeg: 0,
      slopePercentText: "0 %",
      normalDirectionText: "keine",
    };
  }

  const anchor = new Cartesian3(
    plane.anchorECEF.x,
    plane.anchorECEF.y,
    plane.anchorECEF.z
  );
  const normalRaw = new Cartesian3(
    plane.normalECEF.x,
    plane.normalECEF.y,
    plane.normalECEF.z
  );

  if (Cartesian3.magnitudeSquared(normalRaw) <= 1e-8) {
    return {
      tiltDeg: 0,
      slopePercentText: "0 %",
      normalDirectionText: "keine",
    };
  }

  const normal = Cartesian3.normalize(normalRaw, new Cartesian3());
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, Ellipsoid.WGS84);
  const eastAxis4 = Matrix4.getColumn(enuFrame, 0, new Cartesian4());
  const northAxis4 = Matrix4.getColumn(enuFrame, 1, new Cartesian4());
  const upAxis4 = Matrix4.getColumn(enuFrame, 2, new Cartesian4());
  const eastAxis = Cartesian3.normalize(
    new Cartesian3(eastAxis4.x, eastAxis4.y, eastAxis4.z),
    new Cartesian3()
  );
  const northAxis = Cartesian3.normalize(
    new Cartesian3(northAxis4.x, northAxis4.y, northAxis4.z),
    new Cartesian3()
  );
  const upAxis = Cartesian3.normalize(
    new Cartesian3(upAxis4.x, upAxis4.y, upAxis4.z),
    new Cartesian3()
  );

  const eastComponent = Cartesian3.dot(normal, eastAxis);
  const northComponent = Cartesian3.dot(normal, northAxis);
  const upComponent = Cartesian3.dot(normal, upAxis);
  const horizontalMagnitude = Math.hypot(eastComponent, northComponent);
  const tiltDeg =
    (Math.atan2(horizontalMagnitude, Math.abs(upComponent)) * 180) / Math.PI;

  const slopePercentText =
    tiltDeg >= 90 - PLANE_VERTICAL_TILT_EPSILON_DEG
      ? "∞ %"
      : `${formatNumber(Math.tan((tiltDeg * Math.PI) / 180) * 100)} %`;

  if (horizontalMagnitude <= PLANE_HORIZONTAL_PROJECTION_EPSILON) {
    return {
      tiltDeg,
      slopePercentText,
      normalDirectionText: upComponent >= 0 ? "oben" : "unten",
    };
  }

  const azimuthDeg =
    (Math.atan2(eastComponent, northComponent) * 180) / Math.PI;

  return {
    tiltDeg,
    slopePercentText,
    normalDirectionText: formatCardinalBearingVsNorth(azimuthDeg),
  };
};

const formatElevationValueForWidth = (value: number): string => {
  const roundedValue = Number(value.toFixed(ELEVATION_MAX_RESOLUTION_DECIMALS));
  const decimalDigits =
    roundedValue
      .toFixed(ELEVATION_MAX_RESOLUTION_DECIMALS)
      .split(".")[1]
      ?.replace(/0+$/, "").length ?? 0;

  return roundedValue.toLocaleString("de-DE", {
    minimumFractionDigits: decimalDigits,
    maximumFractionDigits: decimalDigits,
  });
};

export const getElevationInputWidthPx = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return ELEVATION_INPUT_MIN_WIDTH_PX;
  }

  const valueText = formatElevationValueForWidth(value);
  const estimatedWidth =
    valueText.length * ELEVATION_INPUT_CHARACTER_WIDTH_PX +
    ELEVATION_INPUT_CONTROLS_PADDING_PX;

  return Math.max(
    ELEVATION_INPUT_MIN_WIDTH_PX,
    Math.min(ELEVATION_INPUT_MAX_WIDTH_PX, estimatedWidth)
  );
};

export const getConnectedPolygonGroups = (
  planarPolygonGroups: PolygonGroupLike[],
  selectedPolygonGroupId: string | null
) => {
  if (!selectedPolygonGroupId) return [];
  if (planarPolygonGroups.length === 0) return [];

  const groupById = new Map(
    planarPolygonGroups.map((group) => [group.id, group])
  );
  if (!groupById.has(selectedPolygonGroupId)) return [];

  const edgeToGroupIds = new Map<string, string[]>();
  planarPolygonGroups.forEach((group) => {
    group.edgeRelationIds.forEach((edgeRelationId) => {
      if (!edgeRelationId) return;
      const connectedGroupIds = edgeToGroupIds.get(edgeRelationId);
      if (connectedGroupIds) {
        connectedGroupIds.push(group.id);
        return;
      }
      edgeToGroupIds.set(edgeRelationId, [group.id]);
    });
  });

  const adjacencyByGroupId = new Map<string, Set<string>>();
  planarPolygonGroups.forEach((group) => {
    adjacencyByGroupId.set(group.id, new Set());
  });

  edgeToGroupIds.forEach((groupIds) => {
    for (let i = 0; i < groupIds.length; i += 1) {
      const leftGroupId = groupIds[i];
      if (!leftGroupId) continue;
      const adjacency = adjacencyByGroupId.get(leftGroupId);
      if (!adjacency) continue;
      for (let j = 0; j < groupIds.length; j += 1) {
        const rightGroupId = groupIds[j];
        if (!rightGroupId || rightGroupId === leftGroupId) continue;
        adjacency.add(rightGroupId);
      }
    }
  });

  const connectedGroupIds = new Set<string>();
  const queue: string[] = [selectedPolygonGroupId];

  while (queue.length > 0) {
    const currentGroupId = queue.shift();
    if (!currentGroupId || connectedGroupIds.has(currentGroupId)) continue;
    connectedGroupIds.add(currentGroupId);
    const adjacency = adjacencyByGroupId.get(currentGroupId);
    if (!adjacency) continue;
    adjacency.forEach((nextGroupId) => {
      if (!connectedGroupIds.has(nextGroupId)) {
        queue.push(nextGroupId);
      }
    });
  }

  return planarPolygonGroups.filter((group) => connectedGroupIds.has(group.id));
};

export const getPolygonGroupSurfaceTypeLabel = (
  connectedGroups: PolygonGroupLike[]
) => {
  if (connectedGroups.length === 0) return "Dachfläche";
  const normalizedSurfaceTypes = new Set(
    connectedGroups.map((group) => group.surfaceType ?? "roof")
  );
  if (normalizedSurfaceTypes.size > 1) return "Gemischt";
  if (normalizedSurfaceTypes.has("facade")) return "Fassadenfläche";
  if (normalizedSurfaceTypes.has("terrain")) return "Gelände";
  if (normalizedSurfaceTypes.has("footprint")) return "Grundriss";
  return "Dachfläche";
};

export const getPolygonGroupAreaSumsByType = (
  connectedGroups: PolygonGroupLike[]
) => {
  return connectedGroups.reduce(
    (accumulator, group) => {
      const areaSquareMeters = group.areaSquareMeters ?? 0;
      const surfaceType = group.surfaceType ?? "roof";
      if (surfaceType === "facade") {
        return {
          ...accumulator,
          facadeAreaSquareMeters:
            accumulator.facadeAreaSquareMeters + areaSquareMeters,
          totalAreaSquareMeters:
            accumulator.totalAreaSquareMeters + areaSquareMeters,
        };
      }

      return {
        ...accumulator,
        roofAreaSquareMeters:
          accumulator.roofAreaSquareMeters + areaSquareMeters,
        totalAreaSquareMeters:
          accumulator.totalAreaSquareMeters + areaSquareMeters,
      };
    },
    {
      roofAreaSquareMeters: 0,
      facadeAreaSquareMeters: 0,
      totalAreaSquareMeters: 0,
    }
  );
};

export const getRoofAverageSlopeDeg = (connectedGroups: PolygonGroupLike[]) => {
  const roofGroups = connectedGroups.filter(
    (group) => (group.surfaceType ?? "roof") === "roof"
  );
  if (roofGroups.length === 0) return null;

  const roofGroupsWithSlope = roofGroups.filter(
    (group) =>
      typeof group.verticalityDeg === "number" &&
      Number.isFinite(group.verticalityDeg)
  );
  if (roofGroupsWithSlope.length === 0) return null;

  const roofAreaSum = roofGroupsWithSlope.reduce(
    (sum, group) => sum + Math.max(0, group.areaSquareMeters ?? 0),
    0
  );
  if (roofAreaSum > 0) {
    const weightedSlopeSum = roofGroupsWithSlope.reduce(
      (sum, group) =>
        sum +
        (group.verticalityDeg ?? 0) * Math.max(0, group.areaSquareMeters ?? 0),
      0
    );
    return weightedSlopeSum / roofAreaSum;
  }

  const arithmeticSlopeSum = roofGroupsWithSlope.reduce(
    (sum, group) => sum + (group.verticalityDeg ?? 0),
    0
  );
  return arithmeticSlopeSum / roofGroupsWithSlope.length;
};

export const getRoofSlopeLabels = (
  connectedGroups: PolygonGroupLike[],
  allGroups: PolygonGroupLike[]
) => {
  const roofGroups = connectedGroups.filter(
    (group) => (group.surfaceType ?? "roof") === "roof"
  );
  return roofGroups.map((group, index) => {
    const fallbackOrder =
      allGroups.findIndex((candidate) => candidate.id === group.id) + 1;
    const roofLabel = group.name?.trim().length
      ? group.name.trim()
      : `Dach ${fallbackOrder > 0 ? fallbackOrder : index + 1}`;
    return `${roofLabel}: ${formatNumber(group.verticalityDeg ?? 0)}°`;
  });
};
