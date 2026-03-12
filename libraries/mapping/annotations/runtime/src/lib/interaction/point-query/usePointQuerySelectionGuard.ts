import { useCallback, useEffect } from "react";

import {
  Cartesian2,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  isValidScene,
  type Cartesian3,
  type Scene,
} from "@carma/cesium";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  isAreaToolType,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

type UsePointQuerySelectionGuardParams = {
  scene: Scene;
  activeToolType: AnnotationToolType;
  isActiveDrawMode: boolean;
  focusedSelectedNodeChainAnnotationId: string | null;
  selectionModeActive: boolean;
  selectAnnotationById: (id: string | null) => void;
  selectRepresentativeNodeForMeasurementId: (
    measurementId: string | null
  ) => void;
};

export const usePointQuerySelectionGuard = ({
  scene,
  activeToolType,
  isActiveDrawMode,
  focusedSelectedNodeChainAnnotationId,
  selectionModeActive,
  selectAnnotationById,
  selectRepresentativeNodeForMeasurementId,
}: UsePointQuerySelectionGuardParams) => {
  const handlePointQueryBeforePointCreate = useCallback(
    (_positionECEF: Cartesian3 | null, screenPosition: Cartesian2) => {
      if (isValidScene(scene)) {
        const picked = scene.pick(screenPosition);
        const pickedPolygonGroupId = picked?.id?.polygonGroupId;
        if (pickedPolygonGroupId) {
          selectRepresentativeNodeForMeasurementId(pickedPolygonGroupId);
          return false;
        }
      }

      if (isActiveDrawMode) {
        return true;
      }

      if (focusedSelectedNodeChainAnnotationId) {
        selectRepresentativeNodeForMeasurementId(null);
        if (
          activeToolType === ANNOTATION_TYPE_DISTANCE ||
          activeToolType === ANNOTATION_TYPE_POLYLINE ||
          isAreaToolType(activeToolType)
        ) {
          return true;
        }
        return false;
      }

      return true;
    },
    [
      activeToolType,
      focusedSelectedNodeChainAnnotationId,
      isActiveDrawMode,
      scene,
      selectRepresentativeNodeForMeasurementId,
    ]
  );

  useEffect(
    function effectBindPolygonFillSelectionClickHandler() {
      if (!isValidScene(scene) || !selectionModeActive) {
        return;
      }

      const clickHandler = new ScreenSpaceEventHandler(scene.canvas);
      clickHandler.setInputAction((event) => {
        const screenPosition = event.position;
        if (!screenPosition) return;

        const picked = scene.pick(screenPosition);
        if (!picked) {
          selectAnnotationById(null);
          return;
        }
        const pickedPolygonGroupId = picked?.id?.polygonGroupId;
        if (typeof pickedPolygonGroupId !== "string") return;
        if (!pickedPolygonGroupId.trim()) return;

        selectRepresentativeNodeForMeasurementId(pickedPolygonGroupId);
      }, ScreenSpaceEventType.LEFT_CLICK);

      return () => {
        clickHandler.destroy();
      };
    },
    [
      scene,
      selectionModeActive,
      selectAnnotationById,
      selectRepresentativeNodeForMeasurementId,
    ]
  );

  return {
    handlePointQueryBeforePointCreate,
  };
};
