import { useCallback, type Dispatch, type SetStateAction } from "react";
import { Cartesian3, type Scene } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type PlanarPolygonGroup,
} from "@carma-mapping/annotations/core";
import type { AnnotationLivePreviewDescriptor } from "../annotationLivePreview.types";

type UseVerticalPolygonLivePreviewParams = {
  scene: Scene | null;
  isVerticalPolygonPreview: boolean;
  activePreview: AnnotationLivePreviewDescriptor;
  annotations: AnnotationCollection;
  setPlanarPolygonGroups: Dispatch<SetStateAction<PlanarPolygonGroup[]>>;
  getFacadeRectanglePreviewAreaSquareMeters: (
    firstVertexECEF: Cartesian3,
    oppositeVertexECEF: Cartesian3
  ) => number;
};

export const useVerticalPolygonLivePreview = ({
  scene,
  isVerticalPolygonPreview,
  activePreview,
  annotations,
  setPlanarPolygonGroups,
  getFacadeRectanglePreviewAreaSquareMeters,
}: UseVerticalPolygonLivePreviewParams) =>
  useCallback(
    (positionECEF: Cartesian3 | null) => {
      if (!isVerticalPolygonPreview) return;

      const verticalPolygonContext = activePreview.verticalPolygonContext;
      if (!verticalPolygonContext) return;

      const firstPoint = annotations.find(
        (measurement) =>
          measurement.id === verticalPolygonContext.firstVertexPointId &&
          isPointAnnotationEntry(measurement)
      );
      if (!firstPoint || !isPointAnnotationEntry(firstPoint)) return;

      const previewAreaSquareMeters = positionECEF
        ? getFacadeRectanglePreviewAreaSquareMeters(
            firstPoint.geometryECEF,
            positionECEF
          )
        : 0;

      setPlanarPolygonGroups((prev) =>
        prev.map((group) => {
          if (group.id !== verticalPolygonContext.groupId || group.closed) {
            return group;
          }
          if (group.measurementKind !== ANNOTATION_TYPE_AREA_VERTICAL) {
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
      activePreview.verticalPolygonContext,
      annotations,
      getFacadeRectanglePreviewAreaSquareMeters,
      isVerticalPolygonPreview,
      scene,
      setPlanarPolygonGroups,
    ]
  );
