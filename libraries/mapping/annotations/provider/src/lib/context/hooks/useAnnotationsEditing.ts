import { useCallback, useEffect } from "react";

import {
  Cartesian3,
  Cartesian4,
  Matrix4,
  Transforms,
  cartesian3FromJson,
  getLocalUpDirectionAtAnchor,
  getSignedAngleDegAroundAxis,
  normalizeDirection,
  resolveLocalFrameVectors,
} from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  createPlaneFromThreePoints,
  getPointPositionMap,
  getVerticalPolygonAxisRotationSuffix,
  isPointAnnotationEntry,
  orientPlaneNormalTowardPosition,
  type PlanarPolygonPlane,
} from "@carma-mapping/annotations/core";
import { usePointEditingGizmo } from "./usePointEditingGizmo";
import type {
  AnnotationEditTarget,
  AnnotationEditUpdateTarget,
} from "./editing/annotationEdit.types";
import type { AnnotationsManagementState } from "./useAnnotationsManagement";

const VERTICAL_POLYGON_AXIS_ID_ENU_UP = "enu-up";
const VERTICAL_POLYGON_AXIS_ID_ENU_EAST = "enu-east";
const VERTICAL_POLYGON_AXIS_ID_ENU_NORTH = "enu-north";
const PLANAR_POLYGON_AXIS_ID_NORMAL = "planar-normal";
const PLANAR_POLYGON_AXIS_ID_IN_PLANE_PRIMARY = "planar-in-plane-primary";
const PLANAR_POLYGON_AXIS_ID_IN_PLANE_SECONDARY = "planar-in-plane-secondary";

export type AnnotationsEditingState = {
  activeEditTarget: AnnotationEditTarget | null;
  requestStartEdit: (target: AnnotationEditTarget) => void;
  requestStopEdit: () => void;
  requestUpdateEditTarget: (target: AnnotationEditUpdateTarget) => boolean;
};

export const useAnnotationsEditing = (
  managedAnnotations: AnnotationsManagementState
): AnnotationsEditingState => {
  const {
    scene,
    annotations,
    planarPolygonGroups,
    focusedPlanarMeasurementId,
    visibleMeasurementsForRendering,
    pointRadius,
    moveGizmoPointId,
    moveGizmoAxisDirection,
    moveGizmoPreferredAxisId,
    moveGizmoVerticalOffsetEditMode,
    moveGizmoAxisCandidates,
    moveGizmoAxisTitle,
    handleMoveGizmoPointPositionChange,
    setMoveGizmoPointElevationFromMeasurementById,
    setIsMoveGizmoDragging,
    handleMoveGizmoAxisChange,
    handleMoveGizmoExit,
    selectAnnotationById,
    startMoveGizmoForMeasurementId,
    activeEditTarget,
    setActiveEditTarget,
    clearActiveEditTarget,
  } = managedAnnotations;

  const useGroundSnappedPointEditDragZone =
    !moveGizmoVerticalOffsetEditMode && !moveGizmoAxisCandidates;

  usePointEditingGizmo(scene, visibleMeasurementsForRendering, {
    pointRadius,
    moveGizmoPointId,
    moveGizmoAxisDirection,
    moveGizmoPreferredAxisId,
    moveGizmoSnapPlaneDragToGround: useGroundSnappedPointEditDragZone,
    moveGizmoAxisTitle,
    moveGizmoAxisCandidates,
    handleMoveGizmoPointPositionChange,
    setIsMoveGizmoDragging,
    handleMoveGizmoAxisChange,
    handleMoveGizmoExit,
  });

  const getPreferredPlaneFacingPosition = useCallback((): Cartesian3 | null => {
    if (!scene || scene.isDestroyed()) {
      return null;
    }

    return scene.camera.positionWC;
  }, [scene]);

  const orientPlaneTowardSceneCamera = useCallback(
    (plane: PlanarPolygonPlane) =>
      orientPlaneNormalTowardPosition(plane, getPreferredPlaneFacingPosition()),
    [getPreferredPlaneFacingPosition]
  );

  useEffect(
    function effectClearEditTargetWithoutActiveMoveGizmo() {
      if (!moveGizmoPointId) {
        setActiveEditTarget((previousTarget) =>
          previousTarget === null ? previousTarget : null
        );
      }
    },
    [moveGizmoPointId]
  );

  const handlePointVerticalOffsetStemLongPress = useCallback(
    (pointId: string) => {
      const pointMeasurement = annotations.find(
        (annotation) =>
          isPointAnnotationEntry(annotation) && annotation.id === pointId
      );
      if (!pointMeasurement || !isPointAnnotationEntry(pointMeasurement)) {
        return;
      }

      const anchorECEF = pointMeasurement.verticalOffsetAnchorECEF
        ? new Cartesian3(
            pointMeasurement.verticalOffsetAnchorECEF.x,
            pointMeasurement.verticalOffsetAnchorECEF.y,
            pointMeasurement.verticalOffsetAnchorECEF.z
          )
        : pointMeasurement.geometryECEF;
      const upDirection = getLocalUpDirectionAtAnchor(anchorECEF);
      const targetPolylineGroup =
        planarPolygonGroups.find(
          (group) => !group.closed && group.nodeIds.includes(pointId)
        ) ?? null;

      selectAnnotationById(pointId);
      startMoveGizmoForMeasurementId(pointId, {
        axisDirection: upDirection,
        axisTitle: "Vertikalversatz",
        verticalOffsetEditMode: targetPolylineGroup
          ? ANNOTATION_TYPE_POLYLINE
          : ANNOTATION_TYPE_POINT,
        verticalOffsetPlanarMeasurementId: targetPolylineGroup?.id ?? null,
      });
    },
    [
      annotations,
      planarPolygonGroups,
      selectAnnotationById,
      startMoveGizmoForMeasurementId,
    ]
  );

  const handlePointLabelLongPress = useCallback(
    (pointId: string) => {
      const targetVerticalPolygonGroup =
        (focusedPlanarMeasurementId
          ? planarPolygonGroups.find(
              (group) =>
                group.id === focusedPlanarMeasurementId &&
                group.type === ANNOTATION_TYPE_AREA_VERTICAL &&
                group.nodeIds.includes(pointId)
            )
          : null) ??
        planarPolygonGroups.find(
          (group) =>
            group.closed &&
            group.type === ANNOTATION_TYPE_AREA_VERTICAL &&
            group.nodeIds.includes(pointId)
        ) ??
        null;

      if (targetVerticalPolygonGroup) {
        const pointById = getPointPositionMap(annotations);
        const pointPosition = pointById.get(pointId);
        if (pointPosition) {
          const persistedVerticalPolygonFrame = resolveLocalFrameVectors(
            targetVerticalPolygonGroup.planarPolygonLocalFrame
          );
          if (persistedVerticalPolygonFrame) {
            const enuMatrix = Transforms.eastNorthUpToFixedFrame(pointPosition);
            const enuEastAxis4 = Matrix4.getColumn(
              enuMatrix,
              0,
              new Cartesian4()
            );
            const enuEastDirection = normalizeDirection(
              new Cartesian3(enuEastAxis4.x, enuEastAxis4.y, enuEastAxis4.z)
            );
            const eastRotationDegVsEnuEast =
              enuEastDirection &&
              getSignedAngleDegAroundAxis(
                enuEastDirection,
                persistedVerticalPolygonFrame.east,
                persistedVerticalPolygonFrame.north
              );
            const axisRotationSuffix = getVerticalPolygonAxisRotationSuffix(
              eastRotationDegVsEnuEast
            );
            const upAxisTitle = `Punkt entlang der ENU-U-Achse${axisRotationSuffix} verschieben`;
            const verticalPolygonAxisCandidates = [
              {
                id: VERTICAL_POLYGON_AXIS_ID_ENU_UP,
                direction: persistedVerticalPolygonFrame.up,
                color: "rgba(59, 130, 246, 0.98)",
                title: upAxisTitle,
              },
              {
                id: VERTICAL_POLYGON_AXIS_ID_ENU_EAST,
                direction: persistedVerticalPolygonFrame.east,
                color: "rgba(239, 68, 68, 0.98)",
                title: `Punkt entlang der ENU-E-Achse${axisRotationSuffix} verschieben`,
              },
              {
                id: VERTICAL_POLYGON_AXIS_ID_ENU_NORTH,
                direction: persistedVerticalPolygonFrame.north,
                color: "rgba(34, 197, 94, 0.98)",
                title:
                  "Punkt entlang der ENU-N-Achse (Flächennormale) verschieben",
              },
            ] as const;

            selectAnnotationById(pointId);
            startMoveGizmoForMeasurementId(pointId, {
              axisDirection: persistedVerticalPolygonFrame.up,
              axisTitle: upAxisTitle,
              preferredAxisId: VERTICAL_POLYGON_AXIS_ID_ENU_UP,
              axisCandidates: verticalPolygonAxisCandidates.map(
                (axisCandidate) => ({
                  ...axisCandidate,
                  direction: Cartesian3.clone(axisCandidate.direction),
                })
              ),
            });
            return;
          }

          const pointIndex = targetVerticalPolygonGroup.nodeIds.findIndex(
            (nodeId) => nodeId === pointId
          );
          const oppositePointId =
            pointIndex >= 0 && targetVerticalPolygonGroup.nodeIds.length === 4
              ? targetVerticalPolygonGroup.nodeIds[(pointIndex + 2) % 4] ?? null
              : null;
          const oppositePointPosition = oppositePointId
            ? pointById.get(oppositePointId) ?? null
            : null;

          const planeNormalFromGroup = targetVerticalPolygonGroup.plane
            ? normalizeDirection(
                cartesian3FromJson(targetVerticalPolygonGroup.plane.normalECEF)
              )
            : null;
          let planeNormal = planeNormalFromGroup;
          if (!planeNormal) {
            const vertices = targetVerticalPolygonGroup.nodeIds
              .map((nodeId) => pointById.get(nodeId))
              .filter((vertex): vertex is Cartesian3 => Boolean(vertex));
            if (vertices.length >= 3) {
              const derivedPlane = createPlaneFromThreePoints(
                vertices[0],
                vertices[1],
                vertices[2]
              );
              if (derivedPlane) {
                const orientedDerivedPlane =
                  orientPlaneTowardSceneCamera(derivedPlane);
                planeNormal = normalizeDirection(
                  cartesian3FromJson(orientedDerivedPlane.normalECEF)
                );
              }
            }
          }

          if (planeNormal) {
            const upDirection = getLocalUpDirectionAtAnchor(pointPosition);
            const enuMatrix = Transforms.eastNorthUpToFixedFrame(pointPosition);
            const eastAxis4 = Matrix4.getColumn(enuMatrix, 0, new Cartesian4());
            const fallbackEastDirection = normalizeDirection(
              new Cartesian3(eastAxis4.x, eastAxis4.y, eastAxis4.z)
            );

            let eastDirection: Cartesian3 | null = null;
            if (oppositePointPosition) {
              const oppositeDelta = Cartesian3.subtract(
                oppositePointPosition,
                pointPosition,
                new Cartesian3()
              );
              const horizontalHint = Cartesian3.subtract(
                oppositeDelta,
                Cartesian3.multiplyByScalar(
                  upDirection,
                  Cartesian3.dot(oppositeDelta, upDirection),
                  new Cartesian3()
                ),
                new Cartesian3()
              );
              const hintOnPlane = Cartesian3.subtract(
                horizontalHint,
                Cartesian3.multiplyByScalar(
                  planeNormal,
                  Cartesian3.dot(horizontalHint, planeNormal),
                  new Cartesian3()
                ),
                new Cartesian3()
              );
              eastDirection = normalizeDirection(hintOnPlane);
            }

            if (!eastDirection) {
              const inPlaneHorizontal = Cartesian3.cross(
                planeNormal,
                upDirection,
                new Cartesian3()
              );
              eastDirection = normalizeDirection(inPlaneHorizontal);
            }

            if (!eastDirection && fallbackEastDirection) {
              const fallbackOnPlane = Cartesian3.subtract(
                fallbackEastDirection,
                Cartesian3.multiplyByScalar(
                  planeNormal,
                  Cartesian3.dot(fallbackEastDirection, planeNormal),
                  new Cartesian3()
                ),
                new Cartesian3()
              );
              eastDirection = normalizeDirection(fallbackOnPlane);
            }

            if (eastDirection) {
              let northDirection = normalizeDirection(
                Cartesian3.cross(upDirection, eastDirection, new Cartesian3())
              );
              if (!northDirection) {
                northDirection = planeNormal;
              }

              if (Cartesian3.dot(northDirection, planeNormal) < 0) {
                northDirection = Cartesian3.multiplyByScalar(
                  northDirection,
                  -1,
                  new Cartesian3()
                );
                eastDirection = Cartesian3.multiplyByScalar(
                  eastDirection,
                  -1,
                  new Cartesian3()
                );
              }

              const eastRotationDegVsEnuEast =
                fallbackEastDirection &&
                getSignedAngleDegAroundAxis(
                  fallbackEastDirection,
                  eastDirection,
                  northDirection
                );
              const axisRotationSuffix = getVerticalPolygonAxisRotationSuffix(
                eastRotationDegVsEnuEast
              );
              const upAxisTitle = `Punkt entlang der ENU-U-Achse${axisRotationSuffix} verschieben`;

              const verticalPolygonAxisCandidates = [
                {
                  id: VERTICAL_POLYGON_AXIS_ID_ENU_UP,
                  direction: upDirection,
                  color: "rgba(59, 130, 246, 0.98)",
                  title: upAxisTitle,
                },
                {
                  id: VERTICAL_POLYGON_AXIS_ID_ENU_EAST,
                  direction: eastDirection,
                  color: "rgba(239, 68, 68, 0.98)",
                  title: `Punkt entlang der ENU-E-Achse${axisRotationSuffix} verschieben`,
                },
                {
                  id: VERTICAL_POLYGON_AXIS_ID_ENU_NORTH,
                  direction: northDirection,
                  color: "rgba(34, 197, 94, 0.98)",
                  title:
                    "Punkt entlang der ENU-N-Achse (Flächennormale) verschieben",
                },
              ] as const;

              selectAnnotationById(pointId);
              startMoveGizmoForMeasurementId(pointId, {
                axisDirection: upDirection,
                axisTitle: upAxisTitle,
                preferredAxisId: VERTICAL_POLYGON_AXIS_ID_ENU_UP,
                axisCandidates: verticalPolygonAxisCandidates.map(
                  (axisCandidate) => ({
                    ...axisCandidate,
                    direction: Cartesian3.clone(axisCandidate.direction),
                  })
                ),
              });
              return;
            }
          }
        }
      }

      const targetPlanarPolygonGroup =
        (focusedPlanarMeasurementId
          ? planarPolygonGroups.find(
              (group) =>
                group.id === focusedPlanarMeasurementId &&
                group.type === ANNOTATION_TYPE_AREA_PLANAR &&
                group.planeLocked &&
                group.nodeIds.includes(pointId)
            )
          : null) ??
        planarPolygonGroups.find(
          (group) =>
            group.type === ANNOTATION_TYPE_AREA_PLANAR &&
            group.planeLocked &&
            group.nodeIds.includes(pointId)
        ) ??
        null;

      if (targetPlanarPolygonGroup) {
        const pointById = getPointPositionMap(annotations);
        const pointPosition = pointById.get(pointId);
        if (pointPosition) {
          const planeNormalFromGroup = targetPlanarPolygonGroup.plane
            ? normalizeDirection(
                cartesian3FromJson(targetPlanarPolygonGroup.plane.normalECEF)
              )
            : null;
          let planeNormal = planeNormalFromGroup;
          if (!planeNormal) {
            const vertices = targetPlanarPolygonGroup.nodeIds
              .map((nodeId) => pointById.get(nodeId))
              .filter((vertex): vertex is Cartesian3 => Boolean(vertex));
            if (vertices.length >= 3) {
              const derivedPlane = createPlaneFromThreePoints(
                vertices[0],
                vertices[1],
                vertices[2]
              );
              if (derivedPlane) {
                const orientedDerivedPlane =
                  orientPlaneTowardSceneCamera(derivedPlane);
                planeNormal = normalizeDirection(
                  cartesian3FromJson(orientedDerivedPlane.normalECEF)
                );
              }
            }
          }

          if (planeNormal) {
            const upDirection = getLocalUpDirectionAtAnchor(pointPosition);
            const orientedPlaneNormal =
              Cartesian3.dot(planeNormal, upDirection) < 0
                ? Cartesian3.multiplyByScalar(planeNormal, -1, new Cartesian3())
                : Cartesian3.clone(planeNormal);
            const enuMatrix = Transforms.eastNorthUpToFixedFrame(pointPosition);
            const enuEastAxis4 = Matrix4.getColumn(
              enuMatrix,
              0,
              new Cartesian4()
            );
            const enuNorthAxis4 = Matrix4.getColumn(
              enuMatrix,
              1,
              new Cartesian4()
            );
            const enuEastDirection = normalizeDirection(
              new Cartesian3(enuEastAxis4.x, enuEastAxis4.y, enuEastAxis4.z)
            );
            const enuNorthDirection = normalizeDirection(
              new Cartesian3(enuNorthAxis4.x, enuNorthAxis4.y, enuNorthAxis4.z)
            );

            const projectDirectionOntoPlanarPlane = (
              direction: Cartesian3 | null
            ) => {
              if (!direction) return null;
              return normalizeDirection(
                Cartesian3.subtract(
                  direction,
                  Cartesian3.multiplyByScalar(
                    orientedPlaneNormal,
                    Cartesian3.dot(direction, orientedPlaneNormal),
                    new Cartesian3()
                  ),
                  new Cartesian3()
                )
              );
            };

            const inPlanePrimaryDirection =
              projectDirectionOntoPlanarPlane(enuNorthDirection) ??
              projectDirectionOntoPlanarPlane(upDirection);

            const inPlaneSecondaryDirection = inPlanePrimaryDirection
              ? normalizeDirection(
                  Cartesian3.cross(
                    inPlanePrimaryDirection,
                    orientedPlaneNormal,
                    new Cartesian3()
                  )
                ) ?? projectDirectionOntoPlanarPlane(enuEastDirection)
              : null;

            if (inPlanePrimaryDirection && inPlaneSecondaryDirection) {
              const planarNormalAxisTitle =
                "Punkt entlang der Dachflächennormale verschieben";
              const planarAxisCandidates = [
                {
                  id: PLANAR_POLYGON_AXIS_ID_NORMAL,
                  direction: orientedPlaneNormal,
                  color: "rgba(59, 130, 246, 0.98)",
                  title: planarNormalAxisTitle,
                },
                {
                  id: PLANAR_POLYGON_AXIS_ID_IN_PLANE_PRIMARY,
                  direction: inPlanePrimaryDirection,
                  color: "rgba(34, 197, 94, 0.98)",
                  title:
                    "Punkt entlang der ENU-N-Projektion in der Dachebene verschieben",
                },
                {
                  id: PLANAR_POLYGON_AXIS_ID_IN_PLANE_SECONDARY,
                  direction: inPlaneSecondaryDirection,
                  color: "rgba(239, 68, 68, 0.98)",
                  title:
                    "Punkt orthogonal zur ENU-N-Projektion in der Dachebene verschieben",
                },
              ] as const;

              selectAnnotationById(pointId);
              startMoveGizmoForMeasurementId(pointId, {
                axisDirection: orientedPlaneNormal,
                axisTitle: planarNormalAxisTitle,
                preferredAxisId: PLANAR_POLYGON_AXIS_ID_NORMAL,
                axisCandidates: planarAxisCandidates.map((axisCandidate) => ({
                  ...axisCandidate,
                  direction: Cartesian3.clone(axisCandidate.direction),
                })),
              });
              return;
            }
          }
        }
      }

      selectAnnotationById(pointId);
      startMoveGizmoForMeasurementId(pointId);
    },
    [
      annotations,
      focusedPlanarMeasurementId,
      orientPlaneTowardSceneCamera,
      planarPolygonGroups,
      selectAnnotationById,
      startMoveGizmoForMeasurementId,
    ]
  );

  const requestStartEdit = useCallback(
    (target: AnnotationEditTarget) => {
      switch (target.kind) {
        case "point-vertical-offset-stem":
          handlePointVerticalOffsetStemLongPress(target.pointId);
          setActiveEditTarget(target);
          return;
        case "point-label":
          handlePointLabelLongPress(target.pointId);
          setActiveEditTarget(target);
          return;
        case "point":
          selectAnnotationById(target.pointId);
          startMoveGizmoForMeasurementId(target.pointId);
          setActiveEditTarget(target);
          return;
      }
    },
    [
      handlePointLabelLongPress,
      handlePointVerticalOffsetStemLongPress,
      selectAnnotationById,
      startMoveGizmoForMeasurementId,
    ]
  );

  const requestUpdateEditTarget = useCallback(
    (target: AnnotationEditUpdateTarget) => {
      if (target.kind !== "point-elevation-reference" || !moveGizmoPointId) {
        return false;
      }

      setMoveGizmoPointElevationFromMeasurementById(target.pointId);
      return true;
    },
    [moveGizmoPointId, setMoveGizmoPointElevationFromMeasurementById]
  );

  const requestStopEdit = useCallback(() => {
    clearActiveEditTarget();
    handleMoveGizmoExit();
  }, [clearActiveEditTarget, handleMoveGizmoExit]);

  return {
    activeEditTarget,
    requestStartEdit,
    requestStopEdit,
    requestUpdateEditTarget,
  };
};
