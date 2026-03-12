import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  areDistanceRelationsEquivalent,
  getDistanceRelationId,
  getMeasurementEdgeId,
  withDistanceRelationEdgeId,
  type LinearSegmentLineMode,
  type NodeChainAnnotation,
  type PointDistanceRelation,
  type ReferenceLineLabelKind,
  type DirectLineLabelMode,
} from "@carma-mapping/annotations/core";

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
      showComponentLines: boolean;
    }
  >();

  nodeChainAnnotations.forEach((group) => {
    if (group.nodeIds.length < 2) return;
    const isPolylineGroup = group.type === ANNOTATION_TYPE_POLYLINE;
    const isDistanceGroup = group.type === ANNOTATION_TYPE_DISTANCE;
    const segmentLineMode =
      group.segmentLineMode ??
      (isPolylineGroup
        ? defaultPolylineSegmentLineMode
        : LINEAR_SEGMENT_LINE_MODE_DIRECT);
    const showDirectLine = isDistanceGroup
      ? true
      : isPolylineGroup
      ? segmentLineMode === LINEAR_SEGMENT_LINE_MODE_DIRECT
      : true;
    const showComponentLines = isDistanceGroup
      ? false
      : isPolylineGroup
      ? segmentLineMode === LINEAR_SEGMENT_LINE_MODE_COMPONENTS
      : false;
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
      showVerticalLine: desired.showComponentLines,
      showHorizontalLine: desired.showComponentLines,
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
      showVerticalLine: desired.showComponentLines,
      showHorizontalLine: desired.showComponentLines,
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
