import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  buildEdgeRelationIdsForPolygon,
  buildVerticalAutoCloseRectangle,
  computePolylinePlanarAngleSumDeg,
  createPlaneFromThreePoints,
  distancePointToPlane,
  getDistanceRelationId,
  getPointById,
  getPointPositionMap,
  isAreaToolType,
  isPointAnnotationEntry,
  projectPointOntoPlane,
  type AnnotationCollection,
  type AnnotationEntry,
  type ActivePointCreateConfig,
  type AnnotationToolType,
  type LinearSegmentLineMode,
  type NodeChainAnnotation,
  type PolygonAreaType,
} from "@carma-mapping/annotations/core";
import {
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  projectPointToHorizontalPlaneAtAnchor,
} from "@carma/cesium";

import {
  finalizeDraftEntries,
  upsertDraftEntry,
} from "../lifecycle/draftEntryCollection";
import type { AnnotationsStore } from "../../store";
import { createUniqueRuntimeId } from "./createUniqueRuntimeId";
type UseNodeChainPointCreationParams = {
  annotationsStore: AnnotationsStore;
  activeToolType: AnnotationToolType;
  defaultPolylineSegmentLineMode: LinearSegmentLineMode;
  defaultDistanceLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  polylineVerticalOffsetMeters: number;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setActiveNodeChainAnnotationId: Dispatch<SetStateAction<string | null>>;
  trackMeasurementDraftPointIds: (pointIds: readonly string[]) => void;
  clearActiveNodeChainDrawingState: () => void;
  clearMoveGizmo: () => void;
  selectAnnotationById: (id: string | null) => void;
  selectRepresentativeNodeForMeasurementId: (id: string | null) => void;
  orientPlaneTowardSceneCamera: (
    plane: NonNullable<NodeChainAnnotation["plane"]>
  ) => NonNullable<NodeChainAnnotation["plane"]>;
  computePolygonGroupDerivedDataWithCamera: (
    group: NodeChainAnnotation,
    pointById: Map<string, Cartesian3>
  ) => NodeChainAnnotation;
};

const PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS = 0.2;
const PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG = 150;

export type SessionCreateMode = NonNullable<ActivePointCreateConfig["mode"]>;

type AnnotationCollectionEntry = {
  id: string;
  type: string;
  temporary?: boolean;
};

type SessionPointCreateEntryArgs<
  TEntry extends AnnotationCollectionEntry,
  TPayload
> = {
  pointId: string;
  payload: TPayload;
  previousCollection?: TEntry[];
  temporaryMode: boolean;
  useTemporaryForCreatedEntries: boolean;
};

type UseSessionPointCreationOptions<
  TEntry extends AnnotationCollectionEntry,
  TPayload
> = {
  activeSessionMode: SessionCreateMode | null;
  temporaryMode: boolean;
  setCollection: Dispatch<SetStateAction<TEntry[]>>;
  useTemporaryForCreatedEntries?: boolean;
  createEntry: (args: SessionPointCreateEntryArgs<TEntry, TPayload>) => TEntry;
  onPointCreated?: (pointId: string, payload: TPayload) => void;
  onLineFinish?: () => void;
  createPointId?: () => string;
};

type UseSessionPointCreationResult<TPayload> = {
  handlePointCreate: (
    sessionMode: SessionCreateMode,
    payload: TPayload
  ) => boolean;
  handleLineFinish: (sessionMode: SessionCreateMode) => boolean;
};

type UsePointCreatedHandlersParams = {
  selectAnnotationByIdImmediate: (id: string | null) => void;
  setActiveNodeChainAnnotationId: Dispatch<SetStateAction<string | null>>;
  setLabelInputPromptPointId: Dispatch<SetStateAction<string | null>>;
};

const createDefaultPointId = () => createUniqueRuntimeId("point");

export const useSessionPointCreation = <
  TEntry extends AnnotationCollectionEntry,
  TPayload
>({
  activeSessionMode,
  temporaryMode,
  setCollection,
  useTemporaryForCreatedEntries = true,
  createEntry,
  onPointCreated,
  onLineFinish,
  createPointId = createDefaultPointId,
}: UseSessionPointCreationOptions<
  TEntry,
  TPayload
>): UseSessionPointCreationResult<TPayload> => {
  const prevTemporaryModeRef = useRef(temporaryMode);
  const activeSessionModeRef = useRef(activeSessionMode);
  const temporaryModeRef = useRef(temporaryMode);
  const useTemporaryForCreatedEntriesRef = useRef(
    useTemporaryForCreatedEntries
  );
  const createEntryRef = useRef(createEntry);
  const onPointCreatedRef = useRef(onPointCreated);
  const onLineFinishRef = useRef(onLineFinish);
  const createPointIdRef = useRef(createPointId);

  activeSessionModeRef.current = activeSessionMode;
  temporaryModeRef.current = temporaryMode;
  useTemporaryForCreatedEntriesRef.current = useTemporaryForCreatedEntries;
  createEntryRef.current = createEntry;
  onPointCreatedRef.current = onPointCreated;
  onLineFinishRef.current = onLineFinish;
  createPointIdRef.current = createPointId;

  useEffect(() => {
    if (prevTemporaryModeRef.current && !temporaryMode) {
      finalizeDraftEntries(setCollection);
    }
    prevTemporaryModeRef.current = temporaryMode;
  }, [temporaryMode, setCollection]);

  const handlePointCreate = useCallback(
    (sessionMode: SessionCreateMode, payload: TPayload) => {
      if (sessionMode !== activeSessionModeRef.current) {
        return false;
      }

      const pointId = createPointIdRef.current();
      const activeTemporaryMode = temporaryModeRef.current;
      const useTemporaryForCreate =
        activeTemporaryMode && useTemporaryForCreatedEntriesRef.current;

      upsertDraftEntry(
        setCollection,
        (previousCollection) =>
          createEntryRef.current({
            pointId,
            payload,
            previousCollection,
            temporaryMode: activeTemporaryMode,
            useTemporaryForCreatedEntries:
              useTemporaryForCreatedEntriesRef.current,
          }),
        useTemporaryForCreate
      );

      onPointCreatedRef.current?.(pointId, payload);
      return true;
    },
    [setCollection]
  );

  const handleLineFinish = useCallback((sessionMode: SessionCreateMode) => {
    if (sessionMode !== activeSessionModeRef.current) {
      return false;
    }

    onLineFinishRef.current?.();
    return true;
  }, []);

  return {
    handlePointCreate,
    handleLineFinish,
  };
};

export const usePointCreatedHandlers = ({
  selectAnnotationByIdImmediate,
  setActiveNodeChainAnnotationId,
  setLabelInputPromptPointId,
}: UsePointCreatedHandlersParams) => {
  const handlePointAnnotationCreated = useCallback(
    (newPointId: string) => {
      setActiveNodeChainAnnotationId(null);
      selectAnnotationByIdImmediate(newPointId);
    },
    [selectAnnotationByIdImmediate, setActiveNodeChainAnnotationId]
  );

  const handleLabelAnnotationCreated = useCallback(
    (newPointId: string) => {
      setActiveNodeChainAnnotationId(null);
      setLabelInputPromptPointId(newPointId);
      selectAnnotationByIdImmediate(newPointId);
    },
    [
      selectAnnotationByIdImmediate,
      setActiveNodeChainAnnotationId,
      setLabelInputPromptPointId,
    ]
  );

  return {
    handlePointAnnotationCreated,
    handleLabelAnnotationCreated,
  };
};

export const useNodeChainPointCreation = ({
  annotationsStore,
  activeToolType,
  defaultPolylineSegmentLineMode,
  defaultDistanceLineVisibility,
  polylineVerticalOffsetMeters,
  setNodeChainAnnotations,
  setAnnotations,
  setActiveNodeChainAnnotationId,
  trackMeasurementDraftPointIds,
  clearActiveNodeChainDrawingState,
  clearMoveGizmo,
  selectAnnotationById,
  selectRepresentativeNodeForMeasurementId,
  orientPlaneTowardSceneCamera,
  computePolygonGroupDerivedDataWithCamera,
}: UseNodeChainPointCreationParams) => {
  const handleNodeChainPointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      const {
        annotationEntries: currentAnnotations,
        nodeChainAnnotations: currentNodeChainAnnotations,
        activeNodeChainAnnotationId: currentActiveNodeChainAnnotationId,
      } = annotationsStore.getState();
      let projectedPointPosition: Cartesian3 | null = null;
      const activeGroupSnapshot =
        (currentActiveNodeChainAnnotationId
          ? currentNodeChainAnnotations.find(
              (group) => group.id === currentActiveNodeChainAnnotationId
            )
          : null) ?? null;
      const creatingNewGroup =
        !activeGroupSnapshot || Boolean(activeGroupSnapshot.closed);
      const sourcePointId =
        !creatingNewGroup && activeGroupSnapshot
          ? activeGroupSnapshot.nodeIds[
              activeGroupSnapshot.nodeIds.length - 1
            ] ?? null
          : null;
      const nextActiveGroupId = creatingNewGroup
        ? createUniqueRuntimeId("node-chain-annotation")
        : activeGroupSnapshot.id;
      const pointByIdSnapshot = getPointPositionMap(currentAnnotations, {
        [newPointId]: newPointPositionECEF,
      });
      const isDistanceCreation = activeToolType === ANNOTATION_TYPE_DISTANCE;
      const isAreaCreation = isAreaToolType(activeToolType);
      const seedTypeForCreation: NodeChainAnnotation["type"] =
        isDistanceCreation
          ? ANNOTATION_TYPE_DISTANCE
          : isAreaCreation
          ? (activeToolType as PolygonAreaType)
          : ANNOTATION_TYPE_POLYLINE;
      const seedSegmentLineMode = isAreaCreation
        ? LINEAR_SEGMENT_LINE_MODE_DIRECT
        : defaultPolylineSegmentLineMode;
      const seedDistanceLineVisibility = isDistanceCreation
        ? defaultDistanceLineVisibility
        : undefined;
      const verticalAutoCloseFromNewPoint = (() => {
        if (!isAreaCreation) return null;

        const candidateNodeIds = creatingNewGroup
          ? sourcePointId &&
            sourcePointId !== newPointId &&
            pointByIdSnapshot.has(sourcePointId)
            ? [sourcePointId, newPointId]
            : [newPointId]
          : [...(activeGroupSnapshot?.nodeIds ?? []), newPointId];

        const candidateType = creatingNewGroup
          ? seedTypeForCreation
          : activeGroupSnapshot?.type ?? ANNOTATION_TYPE_AREA_PLANAR;

        if (candidateType !== ANNOTATION_TYPE_AREA_VERTICAL) return null;
        if (candidateNodeIds.length !== 2) return null;

        return buildVerticalAutoCloseRectangle(
          pointByIdSnapshot,
          candidateNodeIds[0] ?? null,
          candidateNodeIds[1] ?? null
        );
      })();
      const createdVerticalAutoCorners =
        verticalAutoCloseFromNewPoint?.autoCorners;
      const autoClosedAsVerticalRectangle = Boolean(
        verticalAutoCloseFromNewPoint
      );

      trackMeasurementDraftPointIds([
        newPointId,
        ...(createdVerticalAutoCorners?.map(({ id }) => id) ?? []),
      ]);

      setNodeChainAnnotations((prev) => {
        const activeGroup =
          (currentActiveNodeChainAnnotationId
            ? prev.find(
                (group) => group.id === currentActiveNodeChainAnnotationId
              )
            : null) ?? null;

        const pointById = getPointPositionMap(currentAnnotations, {
          [newPointId]: newPointPositionECEF,
        });

        if (!activeGroup || activeGroup.closed) {
          const seedNodeIds =
            sourcePointId &&
            sourcePointId !== newPointId &&
            pointById.has(sourcePointId)
              ? [sourcePointId, newPointId]
              : [newPointId];
          const seedType = seedTypeForCreation;

          if (
            isAreaCreation &&
            seedType === ANNOTATION_TYPE_AREA_VERTICAL &&
            seedNodeIds.length === 2 &&
            verticalAutoCloseFromNewPoint
          ) {
            verticalAutoCloseFromNewPoint.autoCorners.forEach(
              ({ id, position }) => {
                pointById.set(id, position);
              }
            );
            const closedNodeIds = [
              ...verticalAutoCloseFromNewPoint.closedNodeIds,
            ];
            const closedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
              closedNodeIds,
              true,
              getDistanceRelationId
            );
            return [
              ...prev,
              computePolygonGroupDerivedDataWithCamera(
                {
                  id: nextActiveGroupId,
                  type: seedTypeForCreation,
                  segmentLineMode: seedSegmentLineMode,
                  distanceLineVisibility: seedDistanceLineVisibility,
                  verticalOffsetMeters: polylineVerticalOffsetMeters,
                  nodeIds: closedNodeIds,
                  edgeRelationIds: closedEdgeRelationIds,
                  distanceMeasurementStartPointId:
                    closedNodeIds[0] ?? undefined,
                  closed: true,
                  planeLocked: true,
                  areaSquareMeters: 0,
                  verticalityDeg: 0,
                },
                pointById
              ),
            ];
          }

          const seedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            seedNodeIds,
            false,
            getDistanceRelationId
          );
          return [
            ...prev,
            {
              id: nextActiveGroupId,
              type: seedType,
              segmentLineMode: seedSegmentLineMode,
              distanceLineVisibility: seedDistanceLineVisibility,
              verticalOffsetMeters: polylineVerticalOffsetMeters,
              nodeIds: seedNodeIds,
              edgeRelationIds: seedEdgeRelationIds,
              distanceMeasurementStartPointId: seedNodeIds[0] ?? undefined,
              closed: false,
              planeLocked: false,
              areaSquareMeters: 0,
              verticalityDeg: 0,
            },
          ];
        }

        let nextNodeIds = [...activeGroup.nodeIds, newPointId];
        let shouldCloseGroup = activeGroup.closed;
        let nextPlane = activeGroup.plane;
        let nextPlaneLocked = activeGroup.planeLocked;
        let nextPointPosition = newPointPositionECEF;
        const shouldKeepSurfaceSampledVertices =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_GROUND;
        const isPlanarSurface =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_PLANAR;

        if (
          isPlanarSurface &&
          !nextPlaneLocked &&
          activeGroup.nodeIds.length === 1
        ) {
          const firstNodeId = activeGroup.nodeIds[0] ?? null;
          const firstNodePosition = firstNodeId
            ? pointById.get(firstNodeId) ?? null
            : null;
          if (firstNodePosition) {
            nextPointPosition = projectPointToHorizontalPlaneAtAnchor(
              nextPointPosition,
              firstNodePosition
            );
            projectedPointPosition = nextPointPosition;
            pointById.set(newPointId, nextPointPosition);
          }
        }

        if (!shouldKeepSurfaceSampledVertices && nextPlaneLocked && nextPlane) {
          nextPointPosition = projectPointOntoPlane(
            nextPointPosition,
            nextPlane
          );
          projectedPointPosition = nextPointPosition;
          pointById.set(newPointId, nextPointPosition);
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          isPlanarSurface &&
          !nextPlaneLocked &&
          nextNodeIds.length >= 3
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          if (first && second) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              nextPointPosition
            );
            if (candidatePlane) {
              nextPlane = orientPlaneTowardSceneCamera(candidatePlane);
              nextPlaneLocked = true;
              nextPointPosition = projectPointOntoPlane(
                nextPointPosition,
                nextPlane
              );
              projectedPointPosition = nextPointPosition;
              pointById.set(newPointId, nextPointPosition);
            }
          }
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          !isPlanarSurface &&
          nextNodeIds.length >= 4
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          const third = pointById.get(nextNodeIds[2] ?? "");
          if (first && second && third) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              third
            );
            if (candidatePlane) {
              const orientedCandidatePlane =
                orientPlaneTowardSceneCamera(candidatePlane);
              const planeDistance = distancePointToPlane(
                nextPointPosition,
                orientedCandidatePlane
              );
              const firstFourPoints = nextNodeIds
                .slice(0, 4)
                .map((pointId) => pointById.get(pointId))
                .filter((point): point is Cartesian3 => Boolean(point));
              const planarAngleSum = computePolylinePlanarAngleSumDeg(
                firstFourPoints,
                orientedCandidatePlane
              );

              if (
                planeDistance <= PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS &&
                planarAngleSum < PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG
              ) {
                nextPlane = orientedCandidatePlane;
                nextPlaneLocked = true;
                nextPointPosition = projectPointOntoPlane(
                  nextPointPosition,
                  orientedCandidatePlane
                );
                projectedPointPosition = nextPointPosition;
                pointById.set(newPointId, nextPointPosition);
              }
            }
          }
        }

        if (
          isAreaCreation &&
          activeGroup.type === ANNOTATION_TYPE_AREA_VERTICAL &&
          nextNodeIds.length === 2 &&
          verticalAutoCloseFromNewPoint
        ) {
          verticalAutoCloseFromNewPoint.autoCorners.forEach(
            ({ id, position }) => {
              pointById.set(id, position);
            }
          );
          nextNodeIds = [...verticalAutoCloseFromNewPoint.closedNodeIds];
          shouldCloseGroup = true;
          nextPlaneLocked = true;
        }

        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextNodeIds,
          shouldCloseGroup,
          getDistanceRelationId
        );
        const updatedGroup = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeGroup,
            type: activeGroup.type,
            nodeIds: nextNodeIds,
            edgeRelationIds: nextEdgeRelationIds,
            closed: shouldCloseGroup,
            planeLocked: shouldKeepSurfaceSampledVertices
              ? false
              : nextPlaneLocked,
            plane: shouldKeepSurfaceSampledVertices ? undefined : nextPlane,
          },
          pointById
        );
        return prev.map((group) =>
          group.id === activeGroup.id ? updatedGroup : group
        );
      });

      if (projectedPointPosition) {
        const geometryWGS84 = getDegreesFromCartesian(projectedPointPosition);
        setAnnotations((prev) =>
          prev.map((measurement) => {
            if (
              !isPointAnnotationEntry(measurement) ||
              measurement.id !== newPointId
            ) {
              return measurement;
            }
            return {
              ...measurement,
              geometryECEF: projectedPointPosition as Cartesian3,
              geometryWGS84: {
                longitude: geometryWGS84.longitude,
                latitude: geometryWGS84.latitude,
                altitude: getEllipsoidalAltitudeOrZero(geometryWGS84.altitude),
              },
            };
          })
        );
      }

      if (createdVerticalAutoCorners && createdVerticalAutoCorners.length > 0) {
        setAnnotations((prev) => {
          const pointEntries = prev.filter(isPointAnnotationEntry);
          const maxPointIndex = pointEntries.reduce(
            (maxIndex, measurement) =>
              Math.max(maxIndex, measurement.index ?? 0),
            0
          );
          const autoCornerEntries: AnnotationEntry[] =
            createdVerticalAutoCorners.map(({ id, position }, index) => {
              const cornerWGS84 = getDegreesFromCartesian(position);
              return {
                type: ANNOTATION_TYPE_DISTANCE,
                id,
                index: maxPointIndex + index + 1,
                geometryECEF: position,
                geometryWGS84: {
                  longitude: cornerWGS84.longitude,
                  latitude: cornerWGS84.latitude,
                  altitude: getEllipsoidalAltitudeOrZero(cornerWGS84.altitude),
                },
                timestamp: Date.now() + index,
              };
            });
          return [...prev, ...autoCornerEntries];
        });
      }

      if (autoClosedAsVerticalRectangle) {
        clearActiveNodeChainDrawingState();
        selectRepresentativeNodeForMeasurementId(nextActiveGroupId);
        clearMoveGizmo();
      } else if (isDistanceCreation && sourcePointId) {
        clearActiveNodeChainDrawingState();
        selectAnnotationById(newPointId);
      } else {
        setActiveNodeChainAnnotationId(nextActiveGroupId);
        if (!sourcePointId) {
          selectAnnotationById(newPointId);
        }
      }
    },
    [
      annotationsStore,
      activeToolType,
      clearActiveNodeChainDrawingState,
      clearMoveGizmo,
      computePolygonGroupDerivedDataWithCamera,
      defaultPolylineSegmentLineMode,
      orientPlaneTowardSceneCamera,
      polylineVerticalOffsetMeters,
      selectAnnotationById,
      selectRepresentativeNodeForMeasurementId,
      setActiveNodeChainAnnotationId,
      setAnnotations,
      setNodeChainAnnotations,
      trackMeasurementDraftPointIds,
    ]
  );

  const insertExistingNodeIntoActiveChain = useCallback(
    (existingPointId: string, sourcePointId?: string | null) => {
      const {
        annotationEntries: currentAnnotations,
        nodeChainAnnotations: currentNodeChainAnnotations,
        activeNodeChainAnnotationId: currentActiveNodeChainAnnotationId,
      } = annotationsStore.getState();
      const isNodeChainTool =
        activeToolType === ANNOTATION_TYPE_DISTANCE ||
        activeToolType === ANNOTATION_TYPE_POLYLINE ||
        isAreaToolType(activeToolType);
      if (!isNodeChainTool) return false;

      const existingPoint = getPointById(currentAnnotations, existingPointId);
      if (!existingPoint || !isPointAnnotationEntry(existingPoint))
        return false;
      const existingPointPosition = existingPoint.geometryECEF;
      const activeGroupSnapshot =
        (currentActiveNodeChainAnnotationId
          ? currentNodeChainAnnotations.find(
              (group) => group.id === currentActiveNodeChainAnnotationId
            )
          : null) ?? null;
      const creatingNewGroup =
        !activeGroupSnapshot || Boolean(activeGroupSnapshot.closed);
      const nextActiveGroupId = creatingNewGroup
        ? createUniqueRuntimeId("node-chain-annotation")
        : activeGroupSnapshot.id;
      const pointByIdSnapshot = getPointPositionMap(currentAnnotations);
      const isDistanceCreation = activeToolType === ANNOTATION_TYPE_DISTANCE;
      const isAreaCreation = isAreaToolType(activeToolType);
      const seedTypeForCreation: NodeChainAnnotation["type"] =
        isDistanceCreation
          ? ANNOTATION_TYPE_DISTANCE
          : isAreaCreation
          ? (activeToolType as PolygonAreaType)
          : ANNOTATION_TYPE_POLYLINE;
      const seedSegmentLineMode = isAreaCreation
        ? LINEAR_SEGMENT_LINE_MODE_DIRECT
        : defaultPolylineSegmentLineMode;
      const seedDistanceLineVisibility = isDistanceCreation
        ? defaultDistanceLineVisibility
        : undefined;
      const verticalAutoCloseFromExistingPoint = (() => {
        if (!isAreaCreation) return null;

        const candidateNodeIds = creatingNewGroup
          ? sourcePointId &&
            sourcePointId !== existingPointId &&
            pointByIdSnapshot.has(sourcePointId)
            ? [sourcePointId, existingPointId]
            : [existingPointId]
          : [...(activeGroupSnapshot?.nodeIds ?? []), existingPointId];

        const candidateType = creatingNewGroup
          ? seedTypeForCreation
          : activeGroupSnapshot?.type ?? ANNOTATION_TYPE_AREA_PLANAR;

        if (candidateType !== ANNOTATION_TYPE_AREA_VERTICAL) return null;
        if (candidateNodeIds.length !== 2) return null;

        return buildVerticalAutoCloseRectangle(
          pointByIdSnapshot,
          candidateNodeIds[0] ?? null,
          candidateNodeIds[1] ?? null
        );
      })();
      const createdVerticalAutoCorners =
        verticalAutoCloseFromExistingPoint?.autoCorners;
      const autoClosedAsVerticalRectangle = Boolean(
        verticalAutoCloseFromExistingPoint
      );

      setNodeChainAnnotations((prev) => {
        const activeGroup =
          (currentActiveNodeChainAnnotationId
            ? prev.find(
                (group) => group.id === currentActiveNodeChainAnnotationId
              )
            : null) ?? null;
        const pointById = getPointPositionMap(currentAnnotations);

        if (!activeGroup || activeGroup.closed) {
          const seedNodeIds =
            sourcePointId &&
            sourcePointId !== existingPointId &&
            pointById.has(sourcePointId)
              ? [sourcePointId, existingPointId]
              : [existingPointId];
          const seedType = seedTypeForCreation;

          if (
            isAreaCreation &&
            seedType === ANNOTATION_TYPE_AREA_VERTICAL &&
            seedNodeIds.length === 2 &&
            verticalAutoCloseFromExistingPoint
          ) {
            verticalAutoCloseFromExistingPoint.autoCorners.forEach(
              ({ id, position }) => {
                pointById.set(id, position);
              }
            );
            const closedNodeIds = [
              ...verticalAutoCloseFromExistingPoint.closedNodeIds,
            ];
            const closedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
              closedNodeIds,
              true,
              getDistanceRelationId
            );
            return [
              ...prev,
              computePolygonGroupDerivedDataWithCamera(
                {
                  id: nextActiveGroupId,
                  type: seedTypeForCreation,
                  segmentLineMode: seedSegmentLineMode,
                  distanceLineVisibility: seedDistanceLineVisibility,
                  verticalOffsetMeters: polylineVerticalOffsetMeters,
                  nodeIds: closedNodeIds,
                  edgeRelationIds: closedEdgeRelationIds,
                  distanceMeasurementStartPointId:
                    closedNodeIds[0] ?? undefined,
                  closed: true,
                  planeLocked: true,
                  areaSquareMeters: 0,
                  verticalityDeg: 0,
                },
                pointById
              ),
            ];
          }

          const seedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            seedNodeIds,
            false,
            getDistanceRelationId
          );
          return [
            ...prev,
            {
              id: nextActiveGroupId,
              type: seedType,
              segmentLineMode: seedSegmentLineMode,
              distanceLineVisibility: seedDistanceLineVisibility,
              verticalOffsetMeters: polylineVerticalOffsetMeters,
              nodeIds: seedNodeIds,
              edgeRelationIds: seedEdgeRelationIds,
              distanceMeasurementStartPointId: seedNodeIds[0] ?? undefined,
              closed: false,
              planeLocked: false,
              areaSquareMeters: 0,
              verticalityDeg: 0,
            },
          ];
        }

        const lastNodeId =
          activeGroup.nodeIds[activeGroup.nodeIds.length - 1] ?? null;
        if (lastNodeId === existingPointId) {
          return prev;
        }

        let nextNodeIds = [...activeGroup.nodeIds, existingPointId];
        let shouldCloseGroup = activeGroup.closed;
        let nextPlane = activeGroup.plane;
        let nextPlaneLocked = activeGroup.planeLocked;
        const shouldKeepSurfaceSampledVertices =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_GROUND;
        const isPlanarSurface =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_PLANAR;

        if (
          !shouldKeepSurfaceSampledVertices &&
          isPlanarSurface &&
          !nextPlaneLocked &&
          nextNodeIds.length >= 3
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          if (first && second) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              existingPointPosition
            );
            if (candidatePlane) {
              nextPlane = orientPlaneTowardSceneCamera(candidatePlane);
              nextPlaneLocked = true;
            }
          }
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          !isPlanarSurface &&
          !nextPlaneLocked &&
          nextNodeIds.length >= 4
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          const third = pointById.get(nextNodeIds[2] ?? "");
          if (first && second && third) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              third
            );
            if (candidatePlane) {
              const orientedCandidatePlane =
                orientPlaneTowardSceneCamera(candidatePlane);
              const planeDistance = distancePointToPlane(
                existingPointPosition,
                orientedCandidatePlane
              );
              const firstFourPoints = nextNodeIds
                .slice(0, 4)
                .map((pointId) => pointById.get(pointId))
                .filter((point): point is Cartesian3 => Boolean(point));
              const planarAngleSum = computePolylinePlanarAngleSumDeg(
                firstFourPoints,
                orientedCandidatePlane
              );

              if (
                planeDistance <= PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS &&
                planarAngleSum < PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG
              ) {
                nextPlane = orientedCandidatePlane;
                nextPlaneLocked = true;
              }
            }
          }
        }

        if (
          isAreaCreation &&
          activeGroup.type === ANNOTATION_TYPE_AREA_VERTICAL &&
          nextNodeIds.length === 2 &&
          verticalAutoCloseFromExistingPoint
        ) {
          verticalAutoCloseFromExistingPoint.autoCorners.forEach(
            ({ id, position }) => {
              pointById.set(id, position);
            }
          );
          nextNodeIds = [...verticalAutoCloseFromExistingPoint.closedNodeIds];
          shouldCloseGroup = true;
          nextPlaneLocked = true;
        }

        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextNodeIds,
          shouldCloseGroup,
          getDistanceRelationId
        );
        const updatedGroup = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeGroup,
            type: activeGroup.type,
            nodeIds: nextNodeIds,
            edgeRelationIds: nextEdgeRelationIds,
            closed: shouldCloseGroup,
            planeLocked: shouldKeepSurfaceSampledVertices
              ? false
              : nextPlaneLocked,
            plane: shouldKeepSurfaceSampledVertices ? undefined : nextPlane,
          },
          pointById
        );
        return prev.map((group) =>
          group.id === activeGroup.id ? updatedGroup : group
        );
      });

      if (createdVerticalAutoCorners && createdVerticalAutoCorners.length > 0) {
        setAnnotations((prev) => {
          const pointEntries = prev.filter(isPointAnnotationEntry);
          const maxPointIndex = pointEntries.reduce(
            (maxIndex, measurement) =>
              Math.max(maxIndex, measurement.index ?? 0),
            0
          );
          const autoCornerEntries: AnnotationEntry[] =
            createdVerticalAutoCorners.map(({ id, position }, index) => {
              const cornerWGS84 = getDegreesFromCartesian(position);
              return {
                type: ANNOTATION_TYPE_DISTANCE,
                id,
                index: maxPointIndex + index + 1,
                geometryECEF: position,
                geometryWGS84: {
                  longitude: cornerWGS84.longitude,
                  latitude: cornerWGS84.latitude,
                  altitude: getEllipsoidalAltitudeOrZero(cornerWGS84.altitude),
                },
                timestamp: Date.now() + index,
              };
            });
          return [...prev, ...autoCornerEntries];
        });
      }

      if (autoClosedAsVerticalRectangle) {
        clearActiveNodeChainDrawingState();
        selectRepresentativeNodeForMeasurementId(nextActiveGroupId);
        clearMoveGizmo();
        return true;
      }

      if (isDistanceCreation && sourcePointId) {
        clearActiveNodeChainDrawingState();
        selectAnnotationById(existingPointId);
        return true;
      }

      setActiveNodeChainAnnotationId(nextActiveGroupId);
      if (!sourcePointId) {
        selectAnnotationById(existingPointId);
      }
      return true;
    },
    [
      annotationsStore,
      activeToolType,
      clearActiveNodeChainDrawingState,
      clearMoveGizmo,
      computePolygonGroupDerivedDataWithCamera,
      defaultPolylineSegmentLineMode,
      orientPlaneTowardSceneCamera,
      polylineVerticalOffsetMeters,
      selectAnnotationById,
      selectRepresentativeNodeForMeasurementId,
      setActiveNodeChainAnnotationId,
      setAnnotations,
      setNodeChainAnnotations,
    ]
  );

  return {
    handleNodeChainPointCreated,
    insertExistingNodeIntoActiveChain,
  };
};
