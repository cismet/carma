import { useEffect, type Dispatch, type SetStateAction } from "react";

import { syncNodeChainEdgeDistanceRelations } from "@carma-mapping/annotations/core";
import type {
  DirectLineLabelMode,
  LinearSegmentLineMode,
  NodeChainAnnotation,
  PointDistanceRelation,
  ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";
export const useSyncNodeChainEdgeRelations = ({
  setDistanceRelations,
  nodeChainAnnotations,
  defaultPolylineSegmentLineMode,
  defaultDistanceRelationLabelVisibility,
  defaultDirectLineLabelMode,
}: {
  setDistanceRelations: Dispatch<SetStateAction<PointDistanceRelation[]>>;
  nodeChainAnnotations: NodeChainAnnotation[];
  defaultPolylineSegmentLineMode: LinearSegmentLineMode;
  defaultDistanceRelationLabelVisibility: Record<
    ReferenceLineLabelKind,
    boolean
  >;
  defaultDirectLineLabelMode: DirectLineLabelMode;
}) => {
  useEffect(
    function effectSyncDistanceRelationsWithPolygonEdges() {
      setDistanceRelations((prev) =>
        syncNodeChainEdgeDistanceRelations({
          previousRelations: prev,
          nodeChainAnnotations,
          defaultPolylineSegmentLineMode,
          defaultDistanceRelationLabelVisibility,
          defaultDirectLineLabelMode,
        })
      );
    },
    [
      defaultDirectLineLabelMode,
      defaultDistanceRelationLabelVisibility,
      defaultPolylineSegmentLineMode,
      nodeChainAnnotations,
      setDistanceRelations,
    ]
  );
};
