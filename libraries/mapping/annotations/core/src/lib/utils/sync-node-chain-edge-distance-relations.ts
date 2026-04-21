import {
  ANNOTATION_TYPES,
  type NodeChainAnnotation,
} from "../types/annotation-types";
import { areDistanceRelationsEquivalent } from "./annotation-state-equality";
import type { PointDistanceRelation } from "../types/distance-relation";
import {
  getDistanceRelationId,
  getMeasurementEdgeId,
  withDistanceRelationEdgeId,
} from "./measurement-relations";
import {
  LINEAR_SEGMENT_LINE_MODES,
  type LinearSegmentLineMode,
} from "../types/linear-segment";
import type {
  DirectLineLabelMode,
  ReferenceLineLabelKind,
} from "../visualization/distance/distance-relation-label.types";

type SyncNodeChainEdgeDistanceRelationsParams = {
  previousRelations: PointDistanceRelation[];
  nodeChainAnnotations: NodeChainAnnotation[];
  defaultPolylineSegmentLineMode: LinearSegmentLineMode;
  defaultDistanceRelationLabelVisibility: Record<
    ReferenceLineLabelKind,
    boolean
  >;
  defaultDirectLineLabelMode: DirectLineLabelMode;
};

export const syncNodeChainEdgeDistanceRelations = ({
  previousRelations,
  nodeChainAnnotations,
  defaultPolylineSegmentLineMode,
  defaultDistanceRelationLabelVisibility,
  defaultDirectLineLabelMode,
}: SyncNodeChainEdgeDistanceRelationsParams): PointDistanceRelation[] => {
  const desiredById = new Map<
    string,
    {
      groupId: string;
      pointAId: string;
      pointBId: string;
      showDirectLine: boolean;
      showVerticalLine: boolean;
      showHorizontalLine: boolean;
      showComponentLines: boolean;
    }
  >();

  nodeChainAnnotations.forEach((group) => {
    if (group.nodeIds.length < 2) return;
    const isPolylineGroup = group.type === ANNOTATION_TYPES.POLYLINE;
    const isDistanceGroup = group.type === ANNOTATION_TYPES.DISTANCE;
    const segmentLineMode =
      group.segmentLineMode ??
      (isPolylineGroup
        ? defaultPolylineSegmentLineMode
        : LINEAR_SEGMENT_LINE_MODES.DIRECT);
    const showDirectLine = isDistanceGroup
      ? group.distanceLineVisibility?.direct ?? true
      : isPolylineGroup
      ? segmentLineMode === LINEAR_SEGMENT_LINE_MODES.DIRECT
      : true;
    const showVerticalLine = isDistanceGroup
      ? group.distanceLineVisibility?.vertical ?? false
      : isPolylineGroup
      ? segmentLineMode === LINEAR_SEGMENT_LINE_MODES.COMPONENTS
      : false;
    const showHorizontalLine = isDistanceGroup
      ? group.distanceLineVisibility?.horizontal ?? false
      : isPolylineGroup
      ? segmentLineMode === LINEAR_SEGMENT_LINE_MODES.COMPONENTS
      : false;
    const showComponentLines = showVerticalLine || showHorizontalLine;
    const orderedVertices = group.nodeIds;
    for (let index = 0; index < orderedVertices.length - 1; index += 1) {
      const pointAId = orderedVertices[index];
      const pointBId = orderedVertices[index + 1];
      if (!pointAId || !pointBId) continue;
      const relationId = getDistanceRelationId(pointAId, pointBId);
      desiredById.set(relationId, {
        groupId: group.id,
        pointAId,
        pointBId,
        showDirectLine,
        showVerticalLine,
        showHorizontalLine,
        showComponentLines,
      });
    }
    if (group.closed && orderedVertices.length >= 3) {
      const first = orderedVertices[0];
      const last = orderedVertices[orderedVertices.length - 1];
      if (first && last) {
        const relationId = getDistanceRelationId(last, first);
        desiredById.set(relationId, {
          groupId: group.id,
          pointAId: last,
          pointBId: first,
          showDirectLine,
          showVerticalLine,
          showHorizontalLine,
          showComponentLines,
        });
      }
    }
  });

  const next: PointDistanceRelation[] = [];
  const handledIds = new Set<string>();

  previousRelations.forEach((relation) => {
    const desired = desiredById.get(relation.id);
    if (!desired) {
      if (!relation.polygonGroupId) {
        next.push(relation);
      }
      return;
    }

    handledIds.add(relation.id);
    next.push({
      ...withDistanceRelationEdgeId(relation),
      edgeId: getMeasurementEdgeId(desired.pointAId, desired.pointBId),
      pointAId: desired.pointAId,
      pointBId: desired.pointBId,
      anchorPointId: desired.pointAId,
      polygonGroupId: desired.groupId,
      showDirectLine: desired.showDirectLine,
      showVerticalLine: desired.showVerticalLine,
      showHorizontalLine: desired.showHorizontalLine,
      showComponentLines: desired.showComponentLines,
      labelVisibilityByKind: {
        ...defaultDistanceRelationLabelVisibility,
        ...(relation.labelVisibilityByKind ?? {}),
      },
      directLabelMode: relation.directLabelMode ?? defaultDirectLineLabelMode,
    });
  });

  desiredById.forEach((desired, relationId) => {
    if (handledIds.has(relationId)) return;
    next.push({
      id: relationId,
      edgeId: getMeasurementEdgeId(desired.pointAId, desired.pointBId),
      pointAId: desired.pointAId,
      pointBId: desired.pointBId,
      anchorPointId: desired.pointAId,
      polygonGroupId: desired.groupId,
      showDirectLine: desired.showDirectLine,
      showVerticalLine: desired.showVerticalLine,
      showHorizontalLine: desired.showHorizontalLine,
      showComponentLines: desired.showComponentLines,
      labelVisibilityByKind: {
        ...defaultDistanceRelationLabelVisibility,
      },
      directLabelMode: defaultDirectLineLabelMode,
    });
  });

  return areDistanceRelationsEquivalent(
    previousRelations,
    next,
    defaultDistanceRelationLabelVisibility
  )
    ? previousRelations
    : next;
};
