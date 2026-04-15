import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createPlaneFromThreePoints,
  getPointPositionMap,
  getVerticalPolygonAxisRotationSuffix,
  isPointAnnotationEntry,
  orientPlaneNormalTowardPosition,
  type AnnotationCollection,
  type NodeChainAnnotation,
  type PlanarPolygonPlane,
  type ReferenceLineLabelKind,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import {
  Cartesian3,
  Cartesian4,
  Matrix4,
  Transforms,
  type Scene,
} from "@carma-cesium";
import {
  cartesian3FromMetricVector3,
  getLocalUpDirectionAtAnchor,
  getSignedAngleDegAroundAxis,
  normalizeDirection,
  resolveLocalFrameVectors,
} from "@carma-mapping/engines/cesium/core";
import type { AnnotationEditingContextType } from "../../context/annotations-context.types";
import type { AnnotationsStore } from "../../store";
import type {
  AnnotationEditTarget,
  AnnotationEditUpdateTarget,
} from "./annotation-edit.types";
import { useEditState } from "./use-edit-state";
import { usePointEditingGizmo } from "./use-point-editing-gizmo";
import { usePointEditingState } from "./use-point-editing-state";
const {
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
  POINT: ANNOTATION_TYPE_POINT,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
} = ANNOTATION_TYPES;

const VERTICAL_POLYGON_AXIS_ID_ENU_UP = "enu-up";
const VERTICAL_POLYGON_AXIS_ID_ENU_EAST = "enu-east";
const VERTICAL_POLYGON_AXIS_ID_ENU_NORTH = "enu-north";
const PLANAR_POLYGON_AXIS_ID_NORMAL = "planar-normal";
const PLANAR_POLYGON_AXIS_ID_IN_PLANE_PRIMARY = "planar-in-plane-primary";
const PLANAR_POLYGON_AXIS_ID_IN_PLANE_SECONDARY = "planar-in-plane-secondary";

export type EditingState = {
  contextValue: AnnotationEditingContextType;
  activeEditTarget: AnnotationEditTarget | null;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  handleDistanceRelationLineClick: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  handleDistanceRelationLineLabelToggle: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  handleDistanceRelationCornerClick: (relationId: string) => void;
  handleDistanceRelationMidpointClick: (relationId: string) => void;
  requestStartEdit: (target: AnnotationEditTarget) => void;
  requestStopEdit: () => void;
  requestUpdateEditTarget: (target: AnnotationEditUpdateTarget) => boolean;
};

type UseEditingInput = {
  annotationsStore: AnnotationsStore;
  currentAnnotationId: string | null;
  scene: Scene;
  annotations: AnnotationCollection;
  nodeChainAnnotations: NodeChainAnnotation[];
  referencePoint: Cartesian3 | null;
  selectedAnnotationIds: string[];
  focusedNodeChainAnnotationId: string | null;
  pointRadius: number;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  setReferencePoint: Dispatch<SetStateAction<Cartesian3 | null>>;
  selectAnnotationById: (id: string | null) => void;
  handleDistanceRelationLineClick: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  handleDistanceRelationLineLabelToggle: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  handleDistanceRelationCornerClick: (relationId: string) => void;
  handleDistanceRelationMidpointClick: (relationId: string) => void;
};

export const useEditing = (
  managedAnnotations: UseEditingInput
): EditingState => {
  const {
    annotationsStore,
    currentAnnotationId,
    scene,
    annotations,
    nodeChainAnnotations,
    referencePoint,
    selectedAnnotationIds,
    focusedNodeChainAnnotationId,
    pointRadius,
    setAnnotations,
    setNodeChainAnnotations,
    setReferencePoint,
    selectAnnotationById,
    handleDistanceRelationLineClick,
    handleDistanceRelationLineLabelToggle,
    handleDistanceRelationCornerClick,
    handleDistanceRelationMidpointClick,
  } = managedAnnotations;

  const {
    activeEditTarget,
    setActiveEditTarget,
    clearActiveEditTarget,
    moveGizmo,
    setMoveGizmoDragging,
    startMoveGizmoForAnnotationId,
    setMoveGizmoAxis,
    clearMoveGizmo,
  } = useEditState(annotationsStore, annotations);

  const {
    setMoveGizmoPointElevationFromAnnotationId,
    handleMoveGizmoPointPositionChange,
  } = usePointEditingState(
    annotations,
    nodeChainAnnotations,
    referencePoint,
    selectedAnnotationIds,
    {
      setAnnotations,
      setNodeChainAnnotations,
      setReferencePoint,
      moveGizmo,
    }
  );

  const useGroundSnappedPointEditDragZone =
    !moveGizmo.verticalOffsetEditMode && !moveGizmo.axisCandidates;
  const visibleAnnotationsForRendering = useMemo(
    () => annotations.filter((measurement) => !measurement.hidden),
    [annotations]
  );
  const isLockedPointMeasurement = useCallback(
    (pointId: string) =>
      annotations.some(
        (annotation) =>
          isPointAnnotationEntry(annotation) &&
          annotation.id === pointId &&
          Boolean(annotation.locked)
      ),
    [annotations]
  );

  usePointEditingGizmo(scene, visibleAnnotationsForRendering, moveGizmo, {
    pointRadius,
    snapPlaneDragToGround: useGroundSnappedPointEditDragZone,
    onPointPositionChange: handleMoveGizmoPointPositionChange,
    onDragStateChange: setMoveGizmoDragging,
    onAxisChange: setMoveGizmoAxis,
    onExit: clearMoveGizmo,
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
      if (!moveGizmo.pointId) {
        setActiveEditTarget((previousTarget) =>
          previousTarget === null ? previousTarget : null
        );
      }
    },
    [moveGizmo.pointId, setActiveEditTarget]
  );

  const handlePointVerticalOffsetStemLongPress = useCallback(
    (pointId: string) => {
      if (isLockedPointMeasurement(pointId)) {
        return;
      }

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
        nodeChainAnnotations.find(
          (group) => !group.closed && group.nodeIds.includes(pointId)
        ) ?? null;

      selectAnnotationById(pointId);
      startMoveGizmoForAnnotationId(pointId, {
        axisDirection: upDirection,
        axisTitle: "Vertikalversatz",
        verticalOffsetEditMode: targetPolylineGroup
          ? ANNOTATION_TYPE_POLYLINE
          : ANNOTATION_TYPE_POINT,
        verticalOffsetNodeChainAnnotationId: targetPolylineGroup?.id ?? null,
      });
    },
    [
      annotations,
      isLockedPointMeasurement,
      nodeChainAnnotations,
      selectAnnotationById,
      startMoveGizmoForAnnotationId,
    ]
  );

  const handlePointLabelLongPress = useCallback(
    (pointId: string) => {
      if (isLockedPointMeasurement(pointId)) {
        return;
      }

      const targetVerticalPolygonGroup =
        (focusedNodeChainAnnotationId
          ? nodeChainAnnotations.find(
              (group) =>
                group.id === focusedNodeChainAnnotationId &&
                group.type === ANNOTATION_TYPE_AREA_VERTICAL &&
                group.nodeIds.includes(pointId)
            )
          : null) ??
        nodeChainAnnotations.find(
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
            startMoveGizmoForAnnotationId(pointId, {
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
                cartesian3FromMetricVector3(
                  targetVerticalPolygonGroup.plane.normalECEF
                )
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
                  cartesian3FromMetricVector3(orientedDerivedPlane.normalECEF)
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
              startMoveGizmoForAnnotationId(pointId, {
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

      const targetPolygonAnnotation =
        (focusedNodeChainAnnotationId
          ? nodeChainAnnotations.find(
              (group) =>
                group.id === focusedNodeChainAnnotationId &&
                group.type === ANNOTATION_TYPE_AREA_PLANAR &&
                group.planeLocked &&
                group.nodeIds.includes(pointId)
            )
          : null) ??
        nodeChainAnnotations.find(
          (group) =>
            group.type === ANNOTATION_TYPE_AREA_PLANAR &&
            group.planeLocked &&
            group.nodeIds.includes(pointId)
        ) ??
        null;

      if (targetPolygonAnnotation) {
        const pointById = getPointPositionMap(annotations);
        const pointPosition = pointById.get(pointId);
        if (pointPosition) {
          const planeNormalFromGroup = targetPolygonAnnotation.plane
            ? normalizeDirection(
                cartesian3FromMetricVector3(
                  targetPolygonAnnotation.plane.normalECEF
                )
              )
            : null;
          let planeNormal = planeNormalFromGroup;
          if (!planeNormal) {
            const vertices = targetPolygonAnnotation.nodeIds
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
                  cartesian3FromMetricVector3(orientedDerivedPlane.normalECEF)
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
              startMoveGizmoForAnnotationId(pointId, {
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
      startMoveGizmoForAnnotationId(pointId);
    },
    [
      annotations,
      focusedNodeChainAnnotationId,
      isLockedPointMeasurement,
      orientPlaneTowardSceneCamera,
      nodeChainAnnotations,
      selectAnnotationById,
      startMoveGizmoForAnnotationId,
    ]
  );

  const requestStartEdit = useCallback(
    (target: AnnotationEditTarget) => {
      if (isLockedPointMeasurement(target.pointId)) {
        return;
      }

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
          startMoveGizmoForAnnotationId(target.pointId);
          setActiveEditTarget(target);
          return;
      }
    },
    [
      handlePointLabelLongPress,
      handlePointVerticalOffsetStemLongPress,
      isLockedPointMeasurement,
      setActiveEditTarget,
      selectAnnotationById,
      startMoveGizmoForAnnotationId,
    ]
  );

  const requestUpdateEditTarget = useCallback(
    (target: AnnotationEditUpdateTarget) => {
      if (target.kind !== "point-elevation-reference" || !moveGizmo.pointId) {
        return false;
      }

      setMoveGizmoPointElevationFromAnnotationId(target.pointId);
      return true;
    },
    [moveGizmo.pointId, setMoveGizmoPointElevationFromAnnotationId]
  );

  const requestStopEdit = useCallback(() => {
    clearActiveEditTarget();
    clearMoveGizmo();
  }, [clearActiveEditTarget, clearMoveGizmo]);
  const contextValue = useMemo<AnnotationEditingContextType>(
    () => ({
      currentAnnotationId,
      activeTarget: activeEditTarget,
      requestStart: requestStartEdit,
      requestStop: requestStopEdit,
      requestUpdateTarget: requestUpdateEditTarget,
    }),
    [
      currentAnnotationId,
      activeEditTarget,
      requestStartEdit,
      requestStopEdit,
      requestUpdateEditTarget,
    ]
  );

  return {
    contextValue,
    activeEditTarget,
    moveGizmoPointId: moveGizmo.pointId,
    isMoveGizmoDragging: moveGizmo.isDragging,
    handleDistanceRelationLineClick,
    handleDistanceRelationLineLabelToggle,
    handleDistanceRelationCornerClick,
    handleDistanceRelationMidpointClick,
    requestStartEdit,
    requestStopEdit,
    requestUpdateEditTarget,
  };
};
