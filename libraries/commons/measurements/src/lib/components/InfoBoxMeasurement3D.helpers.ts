import {
  Cartesian3,
  Cartesian4,
  Ellipsoid,
  Matrix4,
  Transforms,
} from "@carma/cesium";
import { formatNumber } from "@carma-mapping/engines/cesium/measurements";

const PLANE_HORIZONTAL_PROJECTION_EPSILON = 1e-6;
const PLANE_VERTICAL_TILT_EPSILON_DEG = 0.1;

const ELEVATION_MAX_RESOLUTION_DECIMALS = 2;
const ELEVATION_INPUT_MIN_WIDTH_PX = 76;
const ELEVATION_INPUT_MAX_WIDTH_PX = 126;
const ELEVATION_INPUT_CHARACTER_WIDTH_PX = 8;
const ELEVATION_INPUT_CONTROLS_PADDING_PX = 34;

export type DistanceRelationLineVisibility = {
  direct: boolean;
  vertical: boolean;
  horizontal: boolean;
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
  areaSquareMeters?: number;
  verticalityDeg?: number;
  surfaceType?: PolygonSurfaceType;
  plane?: PolygonPlaneLike;
};

type PolygonPlaneLike = {
  anchorECEF: { x: number; y: number; z: number };
  normalECEF: { x: number; y: number; z: number };
};

const normalizeDegrees0To360 = (degrees: number) => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const getGermanCardinalDirectionFromAzimuth = (azimuthDeg: number) => {
  const directionLabels = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  const index = Math.round(normalizeDegrees0To360(azimuthDeg) / 45) % 8;
  return directionLabels[index] ?? "N";
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
  const normalizedAzimuthDeg = normalizeDegrees0To360(azimuthDeg);
  const cardinalDirection =
    getGermanCardinalDirectionFromAzimuth(normalizedAzimuthDeg);

  return {
    tiltDeg,
    slopePercentText,
    normalDirectionText: `${cardinalDirection} (${formatNumber(
      normalizedAzimuthDeg
    )}°)`,
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
