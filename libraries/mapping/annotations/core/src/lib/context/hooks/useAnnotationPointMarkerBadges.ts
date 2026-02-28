import { useMemo } from "react";
import {
  DEFAULT_MEASUREMENT_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  type MeasurementShortLabelConfigMap,
  type MeasurementShortLabelKind,
} from "./annotationBadgeTokens";
import {
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_LABEL,
  SPATIAL_MARKUP_KIND_POINT,
} from "../../types/measurementKindRegistry";

export type MeasurementPointMarkerBadge = {
  text: string;
  backgroundColor: string;
  textColor: string;
};

export type MeasurementPointMarkerBadgePointLike = {
  id: string;
  timestamp: number;
  index?: number | null;
};

export type MeasurementPointMarkerBadgePlanarGroupLike = {
  id: string;
  vertexPointIds: string[];
};

export type MeasurementPointMarkerBadgeDistanceRelationLike = {
  id: string;
  pointAId: string;
  pointBId: string;
  polygonGroupId?: string | null;
};

export type PlanarGroupBadgeKind = Exclude<
  MeasurementShortLabelKind,
  | typeof SPATIAL_MARKUP_KIND_POINT
  | typeof SPATIAL_MARKUP_KIND_DISTANCE
  | typeof SPATIAL_MARKUP_KIND_LABEL
>;

type UseMeasurementPointMarkerBadgesParams<
  TPoint extends MeasurementPointMarkerBadgePointLike,
  TPlanarGroup extends MeasurementPointMarkerBadgePlanarGroupLike,
  TDistanceRelation extends MeasurementPointMarkerBadgeDistanceRelationLike
> = {
  pointMeasurements: readonly TPoint[];
  planarPolygonGroups: readonly TPlanarGroup[];
  distanceRelations: readonly TDistanceRelation[];
  pointMeasureOrderById: Readonly<Record<string, number>>;
  resolvePlanarGroupBadgeKind: (group: TPlanarGroup) => PlanarGroupBadgeKind;
  isPointAutoCorner?: (point: TPoint) => boolean;
  configMap?: MeasurementShortLabelConfigMap;
};

export const useAnnotationPointMarkerBadges = <
  TPoint extends MeasurementPointMarkerBadgePointLike,
  TPlanarGroup extends MeasurementPointMarkerBadgePlanarGroupLike,
  TDistanceRelation extends MeasurementPointMarkerBadgeDistanceRelationLike
>({
  pointMeasurements,
  planarPolygonGroups,
  distanceRelations,
  pointMeasureOrderById,
  resolvePlanarGroupBadgeKind,
  isPointAutoCorner,
  configMap = DEFAULT_MEASUREMENT_SHORT_LABEL_CONFIG,
}: UseMeasurementPointMarkerBadgesParams<
  TPoint,
  TPlanarGroup,
  TDistanceRelation
>): Readonly<Record<string, MeasurementPointMarkerBadge>> =>
  useMemo<Readonly<Record<string, MeasurementPointMarkerBadge>>>(() => {
    const badgesByPointId: Record<string, MeasurementPointMarkerBadge> = {};
    const assignedPointIds = new Set<string>();
    const pointById = new Map(
      pointMeasurements.map(
        (measurement) => [measurement.id, measurement] as const
      )
    );

    const assignBadge = (
      pointId: string,
      badge: MeasurementPointMarkerBadge,
      overwrite: boolean = false
    ) => {
      if (!pointId) return;
      if (!overwrite && assignedPointIds.has(pointId)) return;
      badgesByPointId[pointId] = badge;
      assignedPointIds.add(pointId);
    };

    const getGroupSortTuple = (group: TPlanarGroup) => {
      let minIndex = Number.POSITIVE_INFINITY;
      let minTimestamp = Number.POSITIVE_INFINITY;
      group.vertexPointIds.forEach((pointId) => {
        const point = pointById.get(pointId);
        if (!point) return;
        minIndex = Math.min(minIndex, point.index ?? Number.POSITIVE_INFINITY);
        minTimestamp = Math.min(minTimestamp, point.timestamp);
      });

      return { minIndex, minTimestamp };
    };

    const sortedGroups = [...planarPolygonGroups].sort((left, right) => {
      const leftKey = getGroupSortTuple(left);
      const rightKey = getGroupSortTuple(right);
      const indexDelta = leftKey.minIndex - rightKey.minIndex;
      if (indexDelta !== 0) return indexDelta;
      const timeDelta = leftKey.minTimestamp - rightKey.minTimestamp;
      if (timeDelta !== 0) return timeDelta;
      return left.id.localeCompare(right.id);
    });

    const badgeCounterByKind: Record<PlanarGroupBadgeKind, number> = {
      polyline: 1,
      area: 1,
      planar: 1,
      vertical: 1,
    };

    sortedGroups.forEach((group) => {
      const badgeKind = resolvePlanarGroupBadgeKind(group);
      const badgeConfig = configMap[badgeKind];
      const badge: MeasurementPointMarkerBadge = {
        text: formatMeasurementShortLabelToken(
          badgeKind,
          badgeCounterByKind[badgeKind]++,
          configMap
        ),
        backgroundColor: badgeConfig.backgroundColor,
        textColor: badgeConfig.textColor,
      };
      group.vertexPointIds.forEach((pointId) => {
        assignBadge(pointId, badge, true);
      });
    });

    const standaloneDistanceRelations = [...distanceRelations]
      .filter((relation) => !relation.polygonGroupId)
      .sort((left, right) => left.id.localeCompare(right.id));

    const distanceNeighborsByPointId = new Map<string, Set<string>>();
    standaloneDistanceRelations.forEach((relation) => {
      const pointAId = relation.pointAId;
      const pointBId = relation.pointBId;
      if (!pointAId || !pointBId) return;
      if (!distanceNeighborsByPointId.has(pointAId)) {
        distanceNeighborsByPointId.set(pointAId, new Set());
      }
      if (!distanceNeighborsByPointId.has(pointBId)) {
        distanceNeighborsByPointId.set(pointBId, new Set());
      }
      distanceNeighborsByPointId.get(pointAId)?.add(pointBId);
      distanceNeighborsByPointId.get(pointBId)?.add(pointAId);
    });

    const visitedDistancePointIds = new Set<string>();
    let distanceComponentIndex = 0;
    const sortedDistancePointIds = Array.from(
      distanceNeighborsByPointId.keys()
    ).sort((left, right) => left.localeCompare(right));

    sortedDistancePointIds.forEach((startPointId) => {
      if (visitedDistancePointIds.has(startPointId)) return;
      const queue = [startPointId];
      const componentPointIds: string[] = [];
      visitedDistancePointIds.add(startPointId);

      while (queue.length > 0) {
        const currentPointId = queue.shift();
        if (!currentPointId) continue;
        componentPointIds.push(currentPointId);
        const neighbors = distanceNeighborsByPointId.get(currentPointId);
        neighbors?.forEach((neighborPointId) => {
          if (visitedDistancePointIds.has(neighborPointId)) return;
          visitedDistancePointIds.add(neighborPointId);
          queue.push(neighborPointId);
        });
      }

      const distanceConfig = configMap[SPATIAL_MARKUP_KIND_DISTANCE];
      const badge: MeasurementPointMarkerBadge = {
        text: formatMeasurementShortLabelToken(
          SPATIAL_MARKUP_KIND_DISTANCE,
          distanceComponentIndex + 1,
          configMap
        ),
        backgroundColor: distanceConfig.backgroundColor,
        textColor: distanceConfig.textColor,
      };
      distanceComponentIndex += 1;
      componentPointIds.forEach((pointId) => assignBadge(pointId, badge));
    });

    const standalonePoints = [...pointMeasurements]
      .filter((measurement) => {
        if (assignedPointIds.has(measurement.id)) return false;
        if (!isPointAutoCorner) return true;
        return !isPointAutoCorner(measurement);
      })
      .sort((left, right) => {
        const indexDelta = (left.index ?? 0) - (right.index ?? 0);
        if (indexDelta !== 0) return indexDelta;
        const timeDelta = left.timestamp - right.timestamp;
        if (timeDelta !== 0) return timeDelta;
        return left.id.localeCompare(right.id);
      });

    standalonePoints.forEach((point, pointIndex) => {
      const pointOrder = pointMeasureOrderById[point.id];
      const pointConfig = configMap[SPATIAL_MARKUP_KIND_POINT];
      assignBadge(point.id, {
        text: formatMeasurementShortLabelToken(
          SPATIAL_MARKUP_KIND_POINT,
          pointOrder ?? pointIndex + 1,
          configMap
        ),
        backgroundColor: pointConfig.backgroundColor,
        textColor: pointConfig.textColor,
      });
    });

    return badgesByPointId;
  }, [
    configMap,
    distanceRelations,
    isPointAutoCorner,
    planarPolygonGroups,
    pointMeasureOrderById,
    pointMeasurements,
    resolvePlanarGroupBadgeKind,
  ]);
