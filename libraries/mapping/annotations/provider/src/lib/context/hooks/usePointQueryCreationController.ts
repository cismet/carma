import { type Dispatch, type SetStateAction } from "react";

import {
  Cartesian2,
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  type Scene,
} from "@carma/cesium";
import { useAnnotationPointCreation } from "@carma-mapping/annotations/core";
import {
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_DISTANCE,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type AnnotationEntry,
  type AnnotationMode,
} from "@carma-mapping/annotations/core";

import {
  useCesiumPointQuery,
  type CesiumPointQueryCreatePayload,
} from "@carma-mapping/annotations/cesium";
import { type ActivePointCreateConfig } from "./usePointCreateConfigState";

type UsePointQueryCreationControllerParams = {
  scene: Scene | null;
  annotationMode: AnnotationMode;
  pointQueryToolActive: boolean;
  pointQueryEnabled: boolean;
  selectionModeActive: boolean;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  activePointCreateConfig: ActivePointCreateConfig | null;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  handlePointQueryPointCreated: (
    pointId: string,
    positionECEF: Cartesian3
  ) => void;
  handlePointQueryDoubleClick: () => void;
  handlePointQueryBeforePointCreate: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2
  ) => boolean;
  handlePointQueryPointerMoveWithHoveredNodeAnchor: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2,
    surfaceNormalECEF?: Cartesian3 | null
  ) => void;
};

export const usePointQueryCreationController = ({
  scene,
  annotationMode,
  pointQueryToolActive,
  pointQueryEnabled,
  selectionModeActive,
  moveGizmoPointId,
  isMoveGizmoDragging,
  activePointCreateConfig,
  setAnnotations,
  handlePointQueryPointCreated,
  handlePointQueryDoubleClick,
  handlePointQueryBeforePointCreate,
  handlePointQueryPointerMoveWithHoveredNodeAnchor,
}: UsePointQueryCreationControllerParams) => {
  const {
    handlePointCreate: handlePointQueryCreate,
    handleLineFinish: handlePointQueryLineFinish,
  } = useAnnotationPointCreation<
    AnnotationEntry,
    CesiumPointQueryCreatePayload
  >({
    temporaryMode: activePointCreateConfig?.temporaryMode ?? false,
    setCollection: setAnnotations as Dispatch<
      SetStateAction<AnnotationEntry[]>
    >,
    useTemporaryForCreatedEntries:
      activePointCreateConfig?.useTemporaryForCreatedPoints ?? true,
    createEntry: ({
      pointId,
      payload,
      previousCollection,
      temporaryMode: createTemporaryMode,
      useTemporaryForCreatedEntries,
    }) => {
      const geometryWGS84 = getDegreesFromCartesian(
        payload.geometryPositionECEF
      );
      const resolvedLabelAnchor =
        activePointCreateConfig?.labelAnchorOnCreate?.(pointId);
      const resolvedLabelAppearance =
        activePointCreateConfig?.labelAppearanceOnCreate;
      const insertionIndex = createTemporaryMode
        ? useTemporaryForCreatedEntries
          ? 0
          : previousCollection?.filter(isPointAnnotationEntry).length || 0
        : previousCollection?.filter(isPointAnnotationEntry).length || 0;

      return {
        type: ANNOTATION_TYPE_DISTANCE,
        id: pointId,
        index: insertionIndex,
        geometryECEF: payload.geometryPositionECEF,
        geometryWGS84: {
          longitude: geometryWGS84.longitude,
          latitude: geometryWGS84.latitude,
          altitude: getEllipsoidalAltitudeOrZero(geometryWGS84.altitude),
        },
        timestamp: Date.now(),
        ...(activePointCreateConfig?.nameOnCreate &&
        activePointCreateConfig.nameOnCreate.trim().length > 0
          ? { name: activePointCreateConfig.nameOnCreate.trim() }
          : {}),
        ...(activePointCreateConfig?.hiddenOnCreate ? { hidden: true } : {}),
        ...(activePointCreateConfig?.auxiliaryOnCreate
          ? { auxiliaryLabelAnchor: true }
          : {}),
        ...(activePointCreateConfig?.markCreatedPointsAsDistanceAdhoc
          ? { distanceAdhocNode: true }
          : {}),
        ...(payload.hasVerticalOffsetStem
          ? {
              verticalOffsetAnchorECEF: {
                x: payload.anchorPositionECEF.x,
                y: payload.anchorPositionECEF.y,
                z: payload.anchorPositionECEF.z,
              },
            }
          : {}),
        ...(activePointCreateConfig?.labelOnCreate !== undefined
          ? { pointLabelMode: activePointCreateConfig.labelOnCreate }
          : {}),
        ...(resolvedLabelAnchor ? { labelAnchor: resolvedLabelAnchor } : {}),
        ...(resolvedLabelAppearance
          ? { labelAppearance: resolvedLabelAppearance }
          : {}),
      };
    },
    onPointCreated: (pointId, payload) =>
      handlePointQueryPointCreated(pointId, payload.geometryPositionECEF),
    onLineFinish: handlePointQueryDoubleClick,
  });

  useCesiumPointQuery(scene, {
    enabled:
      pointQueryToolActive &&
      pointQueryEnabled &&
      !selectionModeActive &&
      !moveGizmoPointId &&
      !isMoveGizmoDragging &&
      Boolean(activePointCreateConfig),
    verticalOffsetMeters: activePointCreateConfig?.verticalOffsetMeters ?? 0,
    preferGlobeAnchorForVerticalOffset:
      annotationMode === ANNOTATION_TYPE_POINT,
    onBeforePointCreate: handlePointQueryBeforePointCreate,
    onPointCreate: handlePointQueryCreate,
    onLineFinish: handlePointQueryLineFinish,
    onPointerMove: handlePointQueryPointerMoveWithHoveredNodeAnchor,
  });
};
