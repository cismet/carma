import { useMemo } from "react";

import {
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  type AnnotationShortLabelConfigMap,
  type AnnotationShortLabelKind,
} from "./annotationBadgeTokens";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
} from "@carma-mapping/annotations/core";

export type AnnotationPointMarkerBadge = {
  text: string;
  backgroundColor: string;
  textColor: string;
};

export type NodeChainBadgeKind = Exclude<
  AnnotationShortLabelKind,
  | typeof ANNOTATION_TYPE_POINT
  | typeof ANNOTATION_TYPE_DISTANCE
  | typeof ANNOTATION_TYPE_LABEL
>;

export type AnnotationPointMarkerBadgePointLike = {
  id: string;
  timestamp: number;
  index?: number | null;
};

export type AnnotationPointMarkerBadgeNodeChainLike = {
  id: string;
  type: NodeChainBadgeKind;
  nodeIds: string[];
};

export type AnnotationPointMarkerBadgeDistanceRelationLike = {
  id: string;
  pointAId: string;
  pointBId: string;
  polygonGroupId?: string | null;
};

type AnnotationPointMarkerBadgesOptions<
  TPoint extends AnnotationPointMarkerBadgePointLike
> = {
  configMap?: AnnotationShortLabelConfigMap;
};

export const useAnnotationPointMarkerBadges = <
  TPoint extends AnnotationPointMarkerBadgePointLike,
  TNodeChainAnnotation extends AnnotationPointMarkerBadgeNodeChainLike,
  TDistanceRelation extends AnnotationPointMarkerBadgeDistanceRelationLike
>(
  pointEntries: readonly TPoint[],
  nodeChainAnnotations: readonly TNodeChainAnnotation[],
  distanceRelations: readonly TDistanceRelation[],
  pointMeasureOrderById: Readonly<Record<string, number>>,
  {
    configMap = DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  }: AnnotationPointMarkerBadgesOptions<TPoint> = {}
): Readonly<Record<string, AnnotationPointMarkerBadge>> =>
  useMemo<Readonly<Record<string, AnnotationPointMarkerBadge>>>(() => {
    const badgesByPointId: Record<string, AnnotationPointMarkerBadge> = {};
    const assignedPointIds = new Set<string>();
    const pointById = new Map(
      pointEntries.map((measurement) => [measurement.id, measurement] as const)
    );

    const assignBadge = (
      pointId: string,
      badge: AnnotationPointMarkerBadge,
      overwrite: boolean = false
    ) => {
      if (!pointId) return;
      if (!overwrite && assignedPointIds.has(pointId)) return;
      badgesByPointId[pointId] = badge;
      assignedPointIds.add(pointId);
    };

    const getGroupSortTuple = (group: TNodeChainAnnotation) => {
      let minIndex = Number.POSITIVE_INFINITY;
      let minTimestamp = Number.POSITIVE_INFINITY;
      group.nodeIds.forEach((pointId) => {
        const point = pointById.get(pointId);
        if (!point) return;
        minIndex = Math.min(minIndex, point.index ?? Number.POSITIVE_INFINITY);
        minTimestamp = Math.min(minTimestamp, point.timestamp);
      });

      return { minIndex, minTimestamp };
    };

    const sortedGroups = [...nodeChainAnnotations].sort((left, right) => {
      const leftKey = getGroupSortTuple(left);
      const rightKey = getGroupSortTuple(right);
      const indexDelta = leftKey.minIndex - rightKey.minIndex;
      if (indexDelta !== 0) return indexDelta;
      const timeDelta = leftKey.minTimestamp - rightKey.minTimestamp;
      if (timeDelta !== 0) return timeDelta;
      return left.id.localeCompare(right.id);
    });

    const badgeCounterByKind: Record<NodeChainBadgeKind, number> = {
      polyline: 1,
      area: 1,
      planar: 1,
      vertical: 1,
    };

    sortedGroups.forEach((group) => {
      const badgeKind = group.type;
      const badgeConfig = configMap[badgeKind];
      const badge: AnnotationPointMarkerBadge = {
        text: formatMeasurementShortLabelToken(
          badgeKind,
          badgeCounterByKind[badgeKind]++,
          configMap
        ),
        backgroundColor: badgeConfig.backgroundColor,
        textColor: badgeConfig.textColor,
      };
      group.nodeIds.forEach((pointId) => {
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

      const distanceConfig = configMap[ANNOTATION_TYPE_DISTANCE];
      const badge: AnnotationPointMarkerBadge = {
        text: formatMeasurementShortLabelToken(
          ANNOTATION_TYPE_DISTANCE,
          distanceComponentIndex + 1,
          configMap
        ),
        backgroundColor: distanceConfig.backgroundColor,
        textColor: distanceConfig.textColor,
      };
      distanceComponentIndex += 1;
      componentPointIds.forEach((pointId) => assignBadge(pointId, badge));
    });

    const standalonePointMeasureIdSet = new Set(
      Object.keys(pointMeasureOrderById)
    );
    const standalonePoints = [...pointEntries]
      .filter((measurement) => {
        if (assignedPointIds.has(measurement.id)) return false;
        if (!standalonePointMeasureIdSet.has(measurement.id)) return false;
        return true;
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
      const pointConfig = configMap[ANNOTATION_TYPE_POINT];
      assignBadge(point.id, {
        text: formatMeasurementShortLabelToken(
          ANNOTATION_TYPE_POINT,
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
    nodeChainAnnotations,
    pointEntries,
    pointMeasureOrderById,
  ]);
