import { useEffect, type Dispatch, type SetStateAction } from "react";

import {
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  arePolygonAnnotationsEquivalent,
  buildEdgeRelationIdsForPolygon,
  getDistanceRelationId,
  getPointPositionMap,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type LinearSegmentLineMode,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";
import { type Cartesian3 } from "@carma/cesium";

export const useModelIntegritySync = ({
  annotations,
  defaultPolylineSegmentLineMode,
  setDistanceRelations,
  setNodeChainAnnotations,
  computePolygonGroupDerivedDataWithCamera,
}: {
  annotations: AnnotationCollection;
  defaultPolylineSegmentLineMode: LinearSegmentLineMode;
  setDistanceRelations: Dispatch<SetStateAction<PointDistanceRelation[]>>;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  computePolygonGroupDerivedDataWithCamera: (
    group: NodeChainAnnotation,
    pointById: Map<string, Cartesian3>
  ) => NodeChainAnnotation;
}) => {
  const pointEntries = annotations.filter(isPointAnnotationEntry);

  useEffect(
    function effectBackfillMissingSegmentLineModes() {
      setNodeChainAnnotations((prev) => {
        let hasChanges = false;
        const nextGroups = prev.map((group) => {
          if (group.segmentLineMode) {
            return group;
          }
          hasChanges = true;
          return {
            ...group,
            segmentLineMode: group.closed
              ? LINEAR_SEGMENT_LINE_MODE_DIRECT
              : defaultPolylineSegmentLineMode,
          };
        });
        return hasChanges ? nextGroups : prev;
      });
    },
    [defaultPolylineSegmentLineMode, setNodeChainAnnotations]
  );

  useEffect(
    function effectPruneDistanceRelationsForRemovedPoints() {
      const pointEntryIdsForRelations = new Set(
        pointEntries.map((measurement) => measurement.id)
      );
      setDistanceRelations((prev) => {
        const next = prev
          .filter(
            (relation) =>
              pointEntryIdsForRelations.has(relation.pointAId) &&
              pointEntryIdsForRelations.has(relation.pointBId)
          )
          .map((relation) => {
            const fallbackAnchorPointId = relation.pointAId;
            const anchorPointId = pointEntryIdsForRelations.has(
              relation.anchorPointId
            )
              ? relation.anchorPointId
              : fallbackAnchorPointId;
            return {
              ...relation,
              anchorPointId,
            };
          });
        if (next.length !== prev.length) return next;
        for (let index = 0; index < next.length; index += 1) {
          if (next[index]?.anchorPointId !== prev[index]?.anchorPointId) {
            return next;
          }
        }
        return prev;
      });
    },
    [pointEntries, setDistanceRelations]
  );

  useEffect(
    function effectPrunePolygonVerticesForRemovedPoints() {
      const pointEntryIdsForPolygons = new Set(
        pointEntries.map((measurement) => measurement.id)
      );
      const pointById = getPointPositionMap(annotations);
      setNodeChainAnnotations((prev) => {
        let hasChanges = false;
        const nextGroups = prev.flatMap((group) => {
          const nextNodeIds = group.nodeIds.filter((nodeId) =>
            pointEntryIdsForPolygons.has(nodeId)
          );
          if (nextNodeIds.length === 0) {
            hasChanges = true;
            return [];
          }
          const nextClosed = group.closed && nextNodeIds.length >= 3;
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextNodeIds,
            nextClosed,
            getDistanceRelationId
          );
          const nextGroup = computePolygonGroupDerivedDataWithCamera(
            {
              ...group,
              nodeIds: nextNodeIds,
              edgeRelationIds: nextEdgeRelationIds,
              closed: nextClosed,
            },
            pointById
          );
          const groupChanged = !arePolygonAnnotationsEquivalent(
            group,
            nextGroup
          );
          if (groupChanged) {
            hasChanges = true;
          }
          return [groupChanged ? nextGroup : group];
        });
        return hasChanges ? nextGroups : prev;
      });
    },
    [
      annotations,
      computePolygonGroupDerivedDataWithCamera,
      pointEntries,
      setNodeChainAnnotations,
    ]
  );
};
