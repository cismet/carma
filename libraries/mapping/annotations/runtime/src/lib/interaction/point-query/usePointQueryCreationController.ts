import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  Cartesian2,
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  getLocalUpDirectionAtPosition,
  isValidScene,
  type Scene,
} from "@carma/cesium";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  type ActivePointCreateConfig,
  isDistancePointEntry,
  isPointMeasurementEntry,
  type AnnotationCollection,
  type AnnotationEntry,
} from "@carma-mapping/annotations/core";
import { useSessionPointCreation } from "../create/useSessionCreation";

import {
  useCesiumPointQuery,
  type CesiumPointQueryCreatePayload,
} from "@carma-mapping/annotations/cesium";
import { pickPolygonGroupId } from "../../selection/useSelection";

type PointCreatePayload = {
  geometryPositionECEF: Cartesian3;
  anchorPositionECEF: Cartesian3;
  hasVerticalOffsetStem: boolean;
};

const buildPointCreatePayload = (
  payload: CesiumPointQueryCreatePayload,
  {
    verticalOffsetMeters,
    preferGlobeAnchorForVerticalOffset,
  }: {
    verticalOffsetMeters: number;
    preferGlobeAnchorForVerticalOffset: boolean;
  }
): PointCreatePayload => {
  const safeVerticalOffsetMeters = Number.isFinite(verticalOffsetMeters)
    ? verticalOffsetMeters
    : 0;
  const hasVerticalOffsetStem = Math.abs(safeVerticalOffsetMeters) > 1e-9;
  const anchorPosition =
    hasVerticalOffsetStem && preferGlobeAnchorForVerticalOffset
      ? payload.globePositionECEF ?? payload.pickedPositionECEF
      : payload.pickedPositionECEF;

  if (!hasVerticalOffsetStem) {
    return {
      geometryPositionECEF: Cartesian3.clone(
        payload.pickedPositionECEF,
        new Cartesian3()
      ),
      anchorPositionECEF: Cartesian3.clone(anchorPosition, new Cartesian3()),
      hasVerticalOffsetStem: false,
    };
  }

  const localUpDirectionECEF = getLocalUpDirectionAtPosition(anchorPosition);
  return {
    geometryPositionECEF: Cartesian3.add(
      anchorPosition,
      Cartesian3.multiplyByScalar(
        localUpDirectionECEF,
        safeVerticalOffsetMeters,
        new Cartesian3()
      ),
      new Cartesian3()
    ),
    anchorPositionECEF: Cartesian3.clone(anchorPosition, new Cartesian3()),
    hasVerticalOffsetStem: true,
  };
};

type UsePointQueryCreationControllerParams = {
  pointQueryToolActive: boolean;
  pointQueryEnabled: boolean;
  selectionModeActive: boolean;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  isActiveDrawMode: boolean;
  hasFocusedSelection: boolean;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  handlePointQueryPointCreated: (
    pointId: string,
    positionECEF: Cartesian3
  ) => void;
  handlePointQueryDoubleClick: () => void;
  clearFocusedSelection: () => void;
  selectByPolygonGroupId: (groupId: string) => void;
  handleAnnotationCursorMove: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2,
    surfaceNormalECEF?: Cartesian3 | null
  ) => void;
};

export const usePointQueryCreationController = (
  scene: Scene | null,
  activePointCreateConfig: ActivePointCreateConfig | null,
  {
    pointQueryToolActive,
    pointQueryEnabled,
    selectionModeActive,
    moveGizmoPointId,
    isMoveGizmoDragging,
    isActiveDrawMode,
    hasFocusedSelection,
    setAnnotations,
    handlePointQueryPointCreated,
    handlePointQueryDoubleClick,
    clearFocusedSelection,
    selectByPolygonGroupId,
    handleAnnotationCursorMove,
  }: UsePointQueryCreationControllerParams
) => {
  const pointCreateConfig = activePointCreateConfig;
  const activeSessionMode = pointCreateConfig?.mode ?? null;
  const {
    handlePointCreate: handlePointQueryCreate,
    handleLineFinish: handlePointQueryLineFinish,
  } = useSessionPointCreation<AnnotationEntry, PointCreatePayload>({
    activeSessionMode,
    temporaryMode: pointCreateConfig?.temporaryMode ?? false,
    setCollection: setAnnotations as Dispatch<
      SetStateAction<AnnotationEntry[]>
    >,
    useTemporaryForCreatedEntries:
      pointCreateConfig?.useTemporaryForCreatedPoints ?? true,
    createEntry: ({
      pointId,
      payload,
      previousCollection,
      temporaryMode: createTemporaryMode,
      useTemporaryForCreatedEntries,
    }) => {
      if (!pointCreateConfig) {
        throw new Error(
          "Missing point create config while point query creation is active."
        );
      }

      const createdPointType = pointCreateConfig.createdPointType;
      const createdPointIndexEntries =
        previousCollection?.filter(
          createdPointType === ANNOTATION_TYPE_POINT
            ? isPointMeasurementEntry
            : isDistancePointEntry
        ) ?? [];
      const geometryWGS84 = getDegreesFromCartesian(
        payload.geometryPositionECEF
      );
      const resolvedLabelAnchor =
        pointCreateConfig.labelAnchorOnCreate?.(pointId);
      const resolvedLabelAppearance = pointCreateConfig.labelAppearanceOnCreate;
      const insertionIndex = createTemporaryMode
        ? useTemporaryForCreatedEntries
          ? 0
          : createdPointIndexEntries.length
        : createdPointIndexEntries.length;

      return {
        type: createdPointType,
        id: pointId,
        index: insertionIndex,
        geometryECEF: payload.geometryPositionECEF,
        geometryWGS84: {
          longitude: geometryWGS84.longitude,
          latitude: geometryWGS84.latitude,
          altitude: getEllipsoidalAltitudeOrZero(geometryWGS84.altitude),
        },
        timestamp: Date.now(),
        ...(pointCreateConfig.nameOnCreate &&
        pointCreateConfig.nameOnCreate.trim().length > 0
          ? { name: pointCreateConfig.nameOnCreate.trim() }
          : {}),
        ...(pointCreateConfig.hiddenOnCreate ? { hidden: true } : {}),
        ...(pointCreateConfig.auxiliaryOnCreate
          ? { auxiliaryLabelAnchor: true }
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
        ...(pointCreateConfig.labelOnCreate !== undefined
          ? { pointLabelMode: pointCreateConfig.labelOnCreate }
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

  const pointVerticalOffsetMeters =
    pointCreateConfig?.verticalOffsetMeters ?? 0;

  const handleBeforePointCreate = useCallback(
    (_positionECEF: Cartesian3 | null, screenPosition: Cartesian2) => {
      if (isValidScene(scene)) {
        const pickedGroupId = pickPolygonGroupId(scene, screenPosition);
        if (pickedGroupId) {
          selectByPolygonGroupId(pickedGroupId);
          return false;
        }
      }

      if (isActiveDrawMode) {
        return true;
      }

      if (hasFocusedSelection) {
        clearFocusedSelection();
      }

      return true;
    },
    [
      clearFocusedSelection,
      hasFocusedSelection,
      isActiveDrawMode,
      scene,
      selectByPolygonGroupId,
    ]
  );

  useCesiumPointQuery(scene, {
    enabled:
      pointQueryToolActive &&
      pointQueryEnabled &&
      !selectionModeActive &&
      !moveGizmoPointId &&
      !isMoveGizmoDragging &&
      Boolean(pointCreateConfig),
    onBeforePointCreate: handleBeforePointCreate,
    onPointCreate: (payload) =>
      pointCreateConfig
        ? handlePointQueryCreate(
            pointCreateConfig.mode,
            buildPointCreatePayload(payload, {
              verticalOffsetMeters: pointVerticalOffsetMeters,
              preferGlobeAnchorForVerticalOffset: Boolean(
                pointCreateConfig.preferGlobeAnchorForVerticalOffset
              ),
            })
          )
        : false,
    onLineFinish: () =>
      pointCreateConfig
        ? handlePointQueryLineFinish(pointCreateConfig.mode)
        : false,
    onPointerMove: handleAnnotationCursorMove,
  });
};
