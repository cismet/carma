import { useCallback, type Dispatch, type SetStateAction } from "react";
import { Cartesian3, type Scene } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
  getVerticalRectanglePreviewAreaSquareMeters,
  isPointAnnotationEntry,
  type AnnotationCandidateDescriptor,
  type AnnotationCollection,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

export const useVerticalPolygonCandidate = (
  scene: Scene | null,
  annotations: AnnotationCollection,
  candidate: AnnotationCandidateDescriptor,
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>
) => {
  const isVerticalPolygonCandidate =
    candidate.kind === ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL;

  return useCallback(
    (positionECEF: Cartesian3 | null) => {
      if (!isVerticalPolygonCandidate) return;

      const verticalPolygonContext = candidate.verticalPolygonContext;
      if (!verticalPolygonContext) return;

      const firstPoint = annotations.find(
        (measurement) =>
          measurement.id === verticalPolygonContext.firstNodeId &&
          isPointAnnotationEntry(measurement)
      );
      if (!firstPoint || !isPointAnnotationEntry(firstPoint)) return;

      const previewAreaSquareMeters = positionECEF
        ? getVerticalRectanglePreviewAreaSquareMeters(
            firstPoint.geometryECEF,
            positionECEF
          )
        : 0;

      setNodeChainAnnotations((prev) =>
        prev.map((group) => {
          if (group.id !== verticalPolygonContext.groupId || group.closed) {
            return group;
          }
          if (group.type !== ANNOTATION_TYPE_AREA_VERTICAL) {
            return group;
          }
          if (group.nodeIds.length !== 1) {
            return group;
          }
          if (
            Math.abs((group.areaSquareMeters ?? 0) - previewAreaSquareMeters) <=
            1e-9
          ) {
            return group;
          }
          return {
            ...group,
            areaSquareMeters: previewAreaSquareMeters,
          };
        })
      );

      scene?.requestRender();
    },
    [
      candidate.verticalPolygonContext,
      annotations,
      getVerticalRectanglePreviewAreaSquareMeters,
      isVerticalPolygonCandidate,
      scene,
      setNodeChainAnnotations,
    ]
  );
};
