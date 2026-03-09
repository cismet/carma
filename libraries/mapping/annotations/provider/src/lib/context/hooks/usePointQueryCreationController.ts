import { type Dispatch, type SetStateAction } from "react";

import {
  Cartesian2,
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  getLocalUpDirectionAtPosition,
  type Scene,
} from "@carma/cesium";
import { useAnnotationPointCreation } from "@carma-mapping/annotations/core";
import {
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_DISTANCE,
  isDistancePointEntry,
  isPointMeasurementEntry,
  type AnnotationCollection,
  type AnnotationEntry,
  type AnnotationMode,
} from "@carma-mapping/annotations/core";

import {
  useCesiumPointQuery,
  type CesiumPointQueryCreatePayload,
} from "@carma-mapping/annotations/cesium";
import { type ActivePointCreateConfig } from "./usePointCreateConfigState";

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
  handleAnnotationCursorMove: (
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
  handleAnnotationCursorMove,
}: UsePointQueryCreationControllerParams) => {
  const {
    handlePointCreate: handlePointQueryCreate,
    handleLineFinish: handlePointQueryLineFinish,
  } = useAnnotationPointCreation<AnnotationEntry, PointCreatePayload>({
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
      const createdPointType =
        annotationMode === ANNOTATION_TYPE_POINT
          ? ANNOTATION_TYPE_POINT
          : ANNOTATION_TYPE_DISTANCE;
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
        activePointCreateConfig?.labelAnchorOnCreate?.(pointId);
      const resolvedLabelAppearance =
        activePointCreateConfig?.labelAppearanceOnCreate;
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

  const pointVerticalOffsetMeters =
    activePointCreateConfig?.verticalOffsetMeters ?? 0;

  useCesiumPointQuery(scene, {
    enabled:
      pointQueryToolActive &&
      pointQueryEnabled &&
      !selectionModeActive &&
      !moveGizmoPointId &&
      !isMoveGizmoDragging &&
      Boolean(activePointCreateConfig),
    onBeforePointCreate: handlePointQueryBeforePointCreate,
    onPointCreate: (payload) =>
      handlePointQueryCreate(
        buildPointCreatePayload(payload, {
          verticalOffsetMeters: pointVerticalOffsetMeters,
          preferGlobeAnchorForVerticalOffset:
            annotationMode === ANNOTATION_TYPE_POINT,
        })
      ),
    onLineFinish: handlePointQueryLineFinish,
    onPointerMove: handleAnnotationCursorMove,
  });
};
