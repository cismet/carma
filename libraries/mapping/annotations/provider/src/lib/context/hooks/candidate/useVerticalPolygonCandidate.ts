import { useCallback, type Dispatch, type SetStateAction } from "react";
import { Cartesian3, type Scene } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  getVerticalRectanglePreviewAreaSquareMeters,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type PlanarMeasurementGroup,
} from "@carma-mapping/annotations/core";
import {
  ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
  type AnnotationCandidateDescriptor,
} from "../annotationCandidate.types";

export const useVerticalPolygonCandidate = (
  scene: Scene | null,
  annotations: AnnotationCollection,
  candidate: AnnotationCandidateDescriptor,
  setPlanarPolygonGroups: Dispatch<SetStateAction<PlanarMeasurementGroup[]>>
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
          measurement.id === verticalPolygonContext.firstVertexPointId &&
          isPointAnnotationEntry(measurement)
      );
      if (!firstPoint || !isPointAnnotationEntry(firstPoint)) return;

      const previewAreaSquareMeters = positionECEF
        ? getVerticalRectanglePreviewAreaSquareMeters(
            firstPoint.geometryECEF,
            positionECEF
          )
        : 0;

      setPlanarPolygonGroups((prev) =>
        prev.map((group) => {
          if (group.id !== verticalPolygonContext.groupId || group.closed) {
            return group;
          }
          if (group.type !== ANNOTATION_TYPE_AREA_VERTICAL) {
            return group;
          }
          if (group.vertexPointIds.length !== 1) {
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
      setPlanarPolygonGroups,
    ]
  );
};
