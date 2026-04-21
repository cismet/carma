import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ANNOTATION_TYPES,
  computePolygonGroupDerivedData,
  projectPointOntoPlane,
  type NodeChainAnnotation,
  type PlanarPolygonPlane,
} from "@carma-mapping/annotations/core";
import {
  cartesian3FromGeographicCoordinate,
  cartesian3FromMetricVector3,
  geographicCoordinateFromCartesian3,
  createPlaneBasis,
  normalizeDirection,
  projectGeographicCoordinateToScreen,
} from "@carma-mapping/engines/cesium/core";
import {
  useCesiumPointMoveGizmo,
  type CesiumMoveGizmoAxisCandidate,
  type CesiumGizmoScreenPosition,
} from "@carma-mapping/gizmo/cesium";
import { Cartesian3 } from "@carma-cesium";

import {
  resolveAnnotationNodeMoveScope,
  resolveNextNodeLinksForNodeMove,
  setSelectedAnnotationIds,
  updateNodeCoordinateById,
  type AnnotationsStore,
  type AnnotationNodeLink,
  type CesiumGeographicCoordinate,
  type AnnotationNode,
  type StoredAnnotation,
} from "../store";
import type { Scene } from "@carma-cesium";
import {
  applyNodeCoordinateOverridesToNodes,
  areNodeCoordinateOverridesEqual,
  EMPTY_NODE_COORDINATE_OVERRIDES,
  hasNodeCoordinateOverrides,
  type NodeCoordinateOverrides,
} from "../utils/node-coordinate-overrides";
import { resolveNodeSnapSample } from "./lifecycle/node-snap.helpers";

const { AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR } = ANNOTATION_TYPES;

const POINT_EDITING_GIZMO_DEFAULTS = {
  radiusMeters: 3,
  referenceNodeInteractionReleaseGuardMs: 48,
  referenceLineAxis: {
    primary: {
      id: "reference-line-parallel",
      color: "rgba(59, 130, 246, 0.98)",
      title: "Punkt parallel zur Referenzlinie verschieben",
    },
    secondary: {
      id: "reference-line-secondary",
      color: "rgba(34, 197, 94, 0.98)",
      title: "Punkt orthogonal zur Referenzlinie verschieben",
    },
    tertiary: {
      id: "reference-line-tertiary",
      color: "rgba(239, 68, 68, 0.98)",
      title: "Punkt entlang der aktiven Referenzebene verschieben",
    },
  },
} as const;

type MoveGizmoAxisOverride = {
  axisDirection: Cartesian3;
  axisTitle: string;
  preferredAxisId: string;
  axisCandidates: CesiumMoveGizmoAxisCandidate[];
};

const createReferenceLineAxisOverride = (
  lineDirection: Cartesian3
): MoveGizmoAxisOverride | null => {
  const normalizedLineDirection = normalizeDirection(lineDirection);
  if (!normalizedLineDirection) {
    return null;
  }

  const planeBasis = createPlaneBasis(normalizedLineDirection);
  const { primary, secondary, tertiary } =
    POINT_EDITING_GIZMO_DEFAULTS.referenceLineAxis;

  return {
    axisDirection: normalizedLineDirection,
    axisTitle: primary.title,
    preferredAxisId: primary.id,
    axisCandidates: [
      {
        id: primary.id,
        direction: normalizedLineDirection,
        color: primary.color,
        title: primary.title,
      },
      {
        id: secondary.id,
        direction: Cartesian3.clone(planeBasis.xAxis),
        color: secondary.color,
        title: secondary.title,
      },
      {
        id: tertiary.id,
        direction: Cartesian3.clone(planeBasis.yAxis),
        color: tertiary.color,
        title: tertiary.title,
      },
    ],
  };
};

type UsePointEditingGizmoOptions = {
  annotationsStore: AnnotationsStore;
  annotationEntries: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
  onActiveMoveGizmoNodeIdChange?: (nodeId: string | null) => void;
};

type DraftCoordinatePreviewOptions = {
  screenPosition?: CesiumGizmoScreenPosition;
  forcedSnappedNodeId?: string | null;
  rememberBaseCoordinate?: boolean;
  disableSnap?: boolean;
};

const resolveSelectedPlanarAreaMeasurement = ({
  nodeId,
  annotationEntries,
  selectedAnnotationIds,
}: {
  nodeId: string;
  annotationEntries: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
}): StoredAnnotation | null => {
  const planarAreaMeasurements = annotationEntries.filter(
    (annotationEntry) =>
      annotationEntry.toolType === ANNOTATION_TYPE_AREA_PLANAR &&
      annotationEntry.nodeIds.includes(nodeId)
  );
  if (planarAreaMeasurements.length === 0) {
    return null;
  }

  for (
    let selectionIndex = selectedAnnotationIds.length - 1;
    selectionIndex >= 0;
    selectionIndex -= 1
  ) {
    const selectedAnnotationId = selectedAnnotationIds[selectionIndex];
    const selectedPlanarAreaMeasurement =
      planarAreaMeasurements.find(
        (annotationEntry) => annotationEntry.id === selectedAnnotationId
      ) ?? null;
    if (selectedPlanarAreaMeasurement) {
      return selectedPlanarAreaMeasurement;
    }
  }

  return planarAreaMeasurements[0] ?? null;
};

const resolvePlanarAreaEditPlane = ({
  nodeId,
  nodes,
  annotationEntries,
  selectedAnnotationIds,
}: {
  nodeId: string;
  nodes: readonly AnnotationNode[];
  annotationEntries: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
}): PlanarPolygonPlane | null => {
  const planarAreaMeasurement = resolveSelectedPlanarAreaMeasurement({
    nodeId,
    annotationEntries,
    selectedAnnotationIds,
  });
  if (!planarAreaMeasurement) {
    return null;
  }

  const pointById = new Map(
    nodes.map((node) => [
      node.id,
      cartesian3FromGeographicCoordinate(node.coordinate),
    ] as const)
  );
  const derivedPlanarAreaMeasurement = computePolygonGroupDerivedData(
    {
      id: planarAreaMeasurement.id,
      type: ANNOTATION_TYPE_AREA_PLANAR,
      nodeIds: [...planarAreaMeasurement.nodeIds],
      edgeRelationIds: [],
      closed: planarAreaMeasurement.closed ?? true,
      planeLocked: true,
    } satisfies NodeChainAnnotation,
    pointById
  );

  return derivedPlanarAreaMeasurement.plane ?? null;
};

const resolveLinkedMeasurementIdsForNode = ({
  nodeId,
  nodes,
  linkedNodeGroups,
  annotationEntries,
  preferredMeasurementId,
}: {
  nodeId: string;
  nodes: readonly AnnotationNode[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  annotationEntries: readonly StoredAnnotation[];
  preferredMeasurementId?: string;
}) => {
  const { targetLinkedNodeGroup } = resolveAnnotationNodeMoveScope({
    nodeId,
    nodes,
    linkedNodeGroups,
    annotationEntries,
  });
  const linkedNodeIdSet = new Set(targetLinkedNodeGroup?.nodeIds ?? [nodeId]);
  const linkedMeasurementIds = annotationEntries.flatMap((annotationEntry) =>
    annotationEntry.nodeIds.some((annotationNodeId) =>
      linkedNodeIdSet.has(annotationNodeId)
    )
      ? [annotationEntry.id]
      : []
  );

  if (
    preferredMeasurementId &&
    linkedMeasurementIds.includes(preferredMeasurementId)
  ) {
    return [
      ...linkedMeasurementIds.filter(
        (measurementId) => measurementId !== preferredMeasurementId
      ),
      preferredMeasurementId,
    ];
  }

  return linkedMeasurementIds;
};

export const usePointEditingGizmo = (
  scene: Scene | null,
  nodes: readonly AnnotationNode[],
  linkedNodeGroups: readonly AnnotationNodeLink[],
  {
    annotationsStore,
    annotationEntries,
    selectedAnnotationIds,
    onActiveMoveGizmoNodeIdChange,
  }: UsePointEditingGizmoOptions
) => {
  const isNodeLocked = useCallback(
    (nodeId: string) =>
      annotationsStore
        .getState()
        .annotationEntries.some(
          (annotationEntry) =>
            annotationEntry.locked && annotationEntry.nodeIds.includes(nodeId)
        ),
    [annotationsStore]
  );
  const [activeMoveGizmoNodeId, setActiveMoveGizmoNodeId] = useState<
    string | null
  >(null);
  const [isMoveGizmoDragging, setIsMoveGizmoDragging] = useState(false);
  const [axisOverride, setAxisOverride] =
    useState<MoveGizmoAxisOverride | null>(null);
  const [draftNodeCoordinateOverrides, setDraftNodeCoordinateOverrides] =
    useState<NodeCoordinateOverrides>(EMPTY_NODE_COORDINATE_OVERRIDES);
  const [draftLinkToNodeId, setDraftLinkToNodeId] = useState<string | null>(
    null
  );
  const draftNodeCoordinateOverridesRef =
    useRef<NodeCoordinateOverrides>(EMPTY_NODE_COORDINATE_OVERRIDES);
  const draftLinkToNodeIdRef = useRef<string | null>(null);
  const draftPreviewAnimationFrameRef = useRef<number | null>(null);
  const snappedNodeIdRef = useRef<string | null>(null);
  const draftBaseCoordinateRef = useRef<CesiumGeographicCoordinate | null>(null);
  const draftBaseScreenPositionRef = useRef<CesiumGizmoScreenPosition | null>(
    null
  );
  const hoveredReferenceNodeIdRef = useRef<string | null>(null);
  const isMoveGizmoDraggingRef = useRef(false);
  const suppressReferenceInteractionsUntilRef = useRef(0);
  const activePlanarAreaEditPlane = useMemo(
    () =>
      activeMoveGizmoNodeId
        ? resolvePlanarAreaEditPlane({
            nodeId: activeMoveGizmoNodeId,
            nodes,
            annotationEntries,
            selectedAnnotationIds,
          })
        : null,
    [activeMoveGizmoNodeId, annotationEntries, nodes, selectedAnnotationIds]
  );
  const activePlanarAreaDiscNormal = useMemo(
    () =>
      activePlanarAreaEditPlane
        ? cartesian3FromMetricVector3(activePlanarAreaEditPlane.normalECEF)
        : null,
    [activePlanarAreaEditPlane]
  );

  const areReferenceInteractionsSuppressed = useCallback(() => {
    if (isMoveGizmoDraggingRef.current) {
      return true;
    }

    return Date.now() < suppressReferenceInteractionsUntilRef.current;
  }, []);

  const flushDraftPreviewState = useCallback(() => {
    draftPreviewAnimationFrameRef.current = null;
    setDraftLinkToNodeId((currentDraftLinkToNodeId) =>
      currentDraftLinkToNodeId === draftLinkToNodeIdRef.current
        ? currentDraftLinkToNodeId
        : draftLinkToNodeIdRef.current
    );
    setDraftNodeCoordinateOverrides((currentDraftNodeCoordinateOverrides) =>
      areNodeCoordinateOverridesEqual(
        currentDraftNodeCoordinateOverrides,
        draftNodeCoordinateOverridesRef.current
      )
        ? currentDraftNodeCoordinateOverrides
        : draftNodeCoordinateOverridesRef.current
    );
  }, []);

  const scheduleDraftPreviewStateFlush = useCallback(() => {
    if (draftPreviewAnimationFrameRef.current !== null) {
      return;
    }

    if (typeof window === "undefined") {
      flushDraftPreviewState();
      return;
    }

    draftPreviewAnimationFrameRef.current = window.requestAnimationFrame(() => {
      flushDraftPreviewState();
    });
  }, [flushDraftPreviewState]);

  const updateDraftPreviewState = useCallback(
    ({
      nextDraftNodeCoordinateOverrides,
      nextDraftLinkToNodeId,
    }: {
      nextDraftNodeCoordinateOverrides: NodeCoordinateOverrides;
      nextDraftLinkToNodeId: string | null;
    }) => {
      const normalizedDraftNodeCoordinateOverrides =
        !hasNodeCoordinateOverrides(nextDraftNodeCoordinateOverrides)
          ? EMPTY_NODE_COORDINATE_OVERRIDES
          : nextDraftNodeCoordinateOverrides;
      const draftNodeCoordinateOverridesChanged =
        !areNodeCoordinateOverridesEqual(
          draftNodeCoordinateOverridesRef.current,
          normalizedDraftNodeCoordinateOverrides
        );
      const draftLinkToNodeIdChanged =
        draftLinkToNodeIdRef.current !== nextDraftLinkToNodeId;

      if (!draftNodeCoordinateOverridesChanged && !draftLinkToNodeIdChanged) {
        return;
      }

      draftNodeCoordinateOverridesRef.current =
        normalizedDraftNodeCoordinateOverrides;
      draftLinkToNodeIdRef.current = nextDraftLinkToNodeId;
      scheduleDraftPreviewStateFlush();
    },
    [scheduleDraftPreviewStateFlush]
  );

  const clearDraftNodeCoordinateOverrides = useCallback(() => {
    if (
      draftPreviewAnimationFrameRef.current !== null &&
      typeof window !== "undefined"
    ) {
      window.cancelAnimationFrame(draftPreviewAnimationFrameRef.current);
      draftPreviewAnimationFrameRef.current = null;
    }

    draftNodeCoordinateOverridesRef.current =
      EMPTY_NODE_COORDINATE_OVERRIDES;
    draftLinkToNodeIdRef.current = null;
    snappedNodeIdRef.current = null;
    draftBaseCoordinateRef.current = null;
    draftBaseScreenPositionRef.current = null;
    hoveredReferenceNodeIdRef.current = null;
    setDraftLinkToNodeId((currentDraftLinkToNodeId) =>
      currentDraftLinkToNodeId === null ? currentDraftLinkToNodeId : null
    );
    setDraftNodeCoordinateOverrides((currentDraftNodeCoordinateOverrides) =>
      !hasNodeCoordinateOverrides(currentDraftNodeCoordinateOverrides)
        ? currentDraftNodeCoordinateOverrides
        : EMPTY_NODE_COORDINATE_OVERRIDES
    );
  }, []);

  const commitDraftNodeCoordinateOverrides = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) {
        clearDraftNodeCoordinateOverrides();
        return;
      }

      const latestDraftNodeCoordinateOverrides =
        draftNodeCoordinateOverridesRef.current;
      const latestDraftLinkToNodeId = draftLinkToNodeIdRef.current;
      const coordinate =
        latestDraftNodeCoordinateOverrides[nodeId] ??
        draftNodeCoordinateOverrides[nodeId];
      if (!coordinate) {
        clearDraftNodeCoordinateOverrides();
        return;
      }

      annotationsStore.dispatch(
        updateNodeCoordinateById({
          nodeId,
          coordinate,
          movedNodeIds: Object.keys(latestDraftNodeCoordinateOverrides),
          linkToNodeId: latestDraftLinkToNodeId,
          selectedMeasurementIds:
            annotationsStore.getState().selectionState.selectedAnnotationIds,
        })
      );
      clearDraftNodeCoordinateOverrides();
    },
    [
      annotationsStore,
      clearDraftNodeCoordinateOverrides,
      draftNodeCoordinateOverrides,
    ]
  );

  const setDraftCoordinateForScopedMove = useCallback(
    (
      nodeId: string,
      coordinate: CesiumGeographicCoordinate,
      {
        screenPosition,
        forcedSnappedNodeId,
        rememberBaseCoordinate = false,
        disableSnap = false,
      }: DraftCoordinatePreviewOptions = {}
    ) => {
      const constrainedCoordinate = activePlanarAreaEditPlane
        ? geographicCoordinateFromCartesian3(
            projectPointOntoPlane(
              cartesian3FromGeographicCoordinate(coordinate),
              activePlanarAreaEditPlane
            )
          )
        : coordinate;
      const runtimeState = annotationsStore.getState();
      const { movedNodeIds } = resolveAnnotationNodeMoveScope({
        nodeId,
        nodes,
        linkedNodeGroups,
        annotationEntries: runtimeState.annotationEntries,
        selectedMeasurementIds:
          runtimeState.selectionState.selectedAnnotationIds,
      });

      if (movedNodeIds.length === 0) {
        return;
      }

      if (rememberBaseCoordinate) {
        draftBaseCoordinateRef.current = constrainedCoordinate;
        draftBaseScreenPositionRef.current = screenPosition ?? null;
      }

      if (disableSnap) {
        snappedNodeIdRef.current = null;

        const nextDraftNodeCoordinateOverrides = movedNodeIds.reduce<
          Record<string, CesiumGeographicCoordinate>
        >((draftCoordinatesByNodeId, movedNodeId) => {
          draftCoordinatesByNodeId[movedNodeId] = constrainedCoordinate;
          return draftCoordinatesByNodeId;
        }, {});

        updateDraftPreviewState({
          nextDraftNodeCoordinateOverrides,
          nextDraftLinkToNodeId: null,
        });
        return;
      }

      const projectedScreenPosition =
        scene && !scene.isDestroyed()
          ? projectGeographicCoordinateToScreen(scene, constrainedCoordinate) ??
            undefined
          : undefined;
      const resolvedNodeSnapSample = resolveNodeSnapSample({
        scene,
        nodes,
        linkedNodeGroups,
        coordinate: constrainedCoordinate,
        screenPosition:
          screenPosition ??
          draftBaseScreenPositionRef.current ??
          projectedScreenPosition,
        forcedSnappedNodeId:
          forcedSnappedNodeId ?? hoveredReferenceNodeIdRef.current,
        lockedNodeId: snappedNodeIdRef.current,
        excludedNodeIds: movedNodeIds,
      });
      snappedNodeIdRef.current = resolvedNodeSnapSample.snappedNodeId;

      const nextDraftNodeCoordinateOverrides = movedNodeIds.reduce<
        Record<string, CesiumGeographicCoordinate>
      >((draftCoordinatesByNodeId, movedNodeId) => {
        draftCoordinatesByNodeId[movedNodeId] =
          resolvedNodeSnapSample.coordinate;
        return draftCoordinatesByNodeId;
      }, {});

      updateDraftPreviewState({
        nextDraftNodeCoordinateOverrides,
        nextDraftLinkToNodeId: resolvedNodeSnapSample.snappedNodeId,
      });
    },
    [
      activePlanarAreaEditPlane,
      annotationsStore,
      linkedNodeGroups,
      nodes,
      scene,
      updateDraftPreviewState,
    ]
  );

  const resolveDraftBaseCoordinate = useCallback(
    (nodeId: string) =>
      draftBaseCoordinateRef.current ??
      nodes.find((node) => node.id === nodeId)?.coordinate ??
      null,
    [nodes]
  );

  const effectiveNodes = useMemo(
    () =>
      applyNodeCoordinateOverridesToNodes(
        nodes,
        draftNodeCoordinateOverrides
      ),
    [draftNodeCoordinateOverrides, nodes]
  );
  const effectiveLinkedNodeGroups = useMemo(() => {
    const movedNodeIds = Object.keys(draftNodeCoordinateOverrides);
    const moveScopeNodeId = activeMoveGizmoNodeId ?? movedNodeIds[0] ?? null;
    if (!moveScopeNodeId || movedNodeIds.length === 0) {
      return linkedNodeGroups;
    }

    return resolveNextNodeLinksForNodeMove({
      nodes: effectiveNodes,
      nodeLinks: linkedNodeGroups,
      nodeId: moveScopeNodeId,
      movedNodeIds,
      linkToNodeId: draftLinkToNodeId,
    });
  }, [
    activeMoveGizmoNodeId,
    draftLinkToNodeId,
    draftNodeCoordinateOverrides,
    effectiveNodes,
    linkedNodeGroups,
  ]);

  const handleNodeLongPress = useCallback(
    (nodeId: string, measurementId?: string) => {
      if (isNodeLocked(nodeId)) {
        return;
      }

      if (activeMoveGizmoNodeId && activeMoveGizmoNodeId !== nodeId) {
        commitDraftNodeCoordinateOverrides(activeMoveGizmoNodeId);
      }

      const runtimeState = annotationsStore.getState();
      const linkedMeasurementIds = resolveLinkedMeasurementIdsForNode({
        nodeId,
        nodes,
        linkedNodeGroups,
        annotationEntries: runtimeState.annotationEntries,
        preferredMeasurementId: measurementId,
      });
      if (
        linkedMeasurementIds.length > 0 &&
        (linkedMeasurementIds.length !==
          runtimeState.selectionState.selectedAnnotationIds.length ||
          linkedMeasurementIds.some(
            (linkedMeasurementId, index) =>
              linkedMeasurementId !==
              runtimeState.selectionState.selectedAnnotationIds[index]
          ))
      ) {
        annotationsStore.dispatch(setSelectedAnnotationIds(linkedMeasurementIds));
      }

      setAxisOverride(null);
      setActiveMoveGizmoNodeId(nodeId);
    },
    [
      activeMoveGizmoNodeId,
      annotationsStore,
      commitDraftNodeCoordinateOverrides,
      isNodeLocked,
      linkedNodeGroups,
      nodes,
    ]
  );

  const nodesById = useMemo(
    () => new Map(effectiveNodes.map((node) => [node.id, node] as const)),
    [effectiveNodes]
  );

  const handleReferenceNodeClick = useCallback(
    (referenceNodeId: string) => {
      if (!activeMoveGizmoNodeId || areReferenceInteractionsSuppressed()) {
        return false;
      }

      const activeNode = nodesById.get(activeMoveGizmoNodeId);
      const referenceNode = nodesById.get(referenceNodeId);
      if (!activeNode || !referenceNode) {
        return false;
      }

      if (activeNode.id !== referenceNode.id) {
        const nextCoordinate = {
          ...activeNode.coordinate,
          altitude: referenceNode.coordinate.altitude,
        };
        hoveredReferenceNodeIdRef.current = null;
        draftBaseCoordinateRef.current = nextCoordinate;
        setDraftCoordinateForScopedMove(activeNode.id, nextCoordinate, {
          disableSnap: true,
        });
      }

      return true;
    },
    [
      activeMoveGizmoNodeId,
      areReferenceInteractionsSuppressed,
      nodesById,
      setDraftCoordinateForScopedMove,
    ]
  );

  const handleReferenceNodeHover = useCallback(
    (referenceNodeId: string, hovered: boolean) => {
      if (!activeMoveGizmoNodeId || areReferenceInteractionsSuppressed()) {
        return;
      }

      const baseCoordinate = resolveDraftBaseCoordinate(activeMoveGizmoNodeId);
      const referenceNode = nodesById.get(referenceNodeId);
      if (!baseCoordinate) {
        return;
      }

      if (hovered) {
        hoveredReferenceNodeIdRef.current = referenceNodeId;
        setDraftCoordinateForScopedMove(
          activeMoveGizmoNodeId,
          {
            ...baseCoordinate,
            altitude:
              referenceNode?.coordinate.altitude ?? baseCoordinate.altitude,
          },
          {
            disableSnap: true,
          }
        );
        return;
      }

      if (hoveredReferenceNodeIdRef.current !== referenceNodeId) {
        return;
      }

      hoveredReferenceNodeIdRef.current = null;
      setDraftCoordinateForScopedMove(activeMoveGizmoNodeId, baseCoordinate, {
        screenPosition: draftBaseScreenPositionRef.current ?? undefined,
        disableSnap: true,
      });
    },
    [
      activeMoveGizmoNodeId,
      areReferenceInteractionsSuppressed,
      nodesById,
      resolveDraftBaseCoordinate,
      setDraftCoordinateForScopedMove,
    ]
  );

  const handleReferenceEdgeClick = useCallback(
    (startNodeId: string, endNodeId: string) => {
      if (!activeMoveGizmoNodeId || areReferenceInteractionsSuppressed()) {
        return false;
      }

      const startNode = nodesById.get(startNodeId);
      const endNode = nodesById.get(endNodeId);
      if (!startNode || !endNode) {
        return false;
      }

      const startPoint = cartesian3FromGeographicCoordinate(
        startNode.coordinate
      );
      const endPoint = cartesian3FromGeographicCoordinate(endNode.coordinate);
      const axisOverrideFromLine = createReferenceLineAxisOverride(
        Cartesian3.subtract(endPoint, startPoint, new Cartesian3())
      );
      if (!axisOverrideFromLine) {
        return false;
      }

      setAxisOverride(axisOverrideFromLine);
      return true;
    },
    [activeMoveGizmoNodeId, areReferenceInteractionsSuppressed, nodesById]
  );

  const handleGizmoDragStateChange = useCallback(
    (isDragging: boolean) => {
      isMoveGizmoDraggingRef.current = isDragging;
      setIsMoveGizmoDragging((currentIsMoveGizmoDragging) =>
        currentIsMoveGizmoDragging === isDragging
          ? currentIsMoveGizmoDragging
          : isDragging
      );
      if (isDragging || !activeMoveGizmoNodeId) {
        if (isDragging) {
          suppressReferenceInteractionsUntilRef.current = 0;
        }
        return;
      }

      suppressReferenceInteractionsUntilRef.current =
        Date.now() +
        POINT_EDITING_GIZMO_DEFAULTS.referenceNodeInteractionReleaseGuardMs;
      commitDraftNodeCoordinateOverrides(activeMoveGizmoNodeId);
    },
    [activeMoveGizmoNodeId, commitDraftNodeCoordinateOverrides]
  );

  const gizmoPoints = useMemo(
    () =>
      effectiveNodes.map((node) => ({
        id: node.id,
        geometryECEF: cartesian3FromGeographicCoordinate(node.coordinate),
      })),
    [effectiveNodes]
  );

  useCesiumPointMoveGizmo(scene, {
    points: gizmoPoints,
    movePointId: activeMoveGizmoNodeId,
    axisDirection: axisOverride?.axisDirection ?? null,
    discPlaneNormal: activePlanarAreaDiscNormal,
    axisTitle: axisOverride?.axisTitle ?? null,
    preferredAxisId: axisOverride?.preferredAxisId ?? null,
    axisCandidates: axisOverride?.axisCandidates ?? null,
    radius: POINT_EDITING_GIZMO_DEFAULTS.radiusMeters,
    showRotationHandle: false,
    snapPlaneDragToGround: activePlanarAreaEditPlane === null,
    onDragStateChange: handleGizmoDragStateChange,
    onPointPositionChange: (nodeId, nextPosition, screenPosition) => {
      if (isNodeLocked(nodeId)) {
        return;
      }

      setDraftCoordinateForScopedMove(
        nodeId,
        geographicCoordinateFromCartesian3(nextPosition),
        {
          screenPosition,
          rememberBaseCoordinate: true,
        }
      );
    },
    onExit: () => {
      commitDraftNodeCoordinateOverrides(activeMoveGizmoNodeId);
      isMoveGizmoDraggingRef.current = false;
      setIsMoveGizmoDragging(false);
      setAxisOverride(null);
      setActiveMoveGizmoNodeId(null);
    },
  });

  useEffect(() => {
    if (!activeMoveGizmoNodeId) {
      clearDraftNodeCoordinateOverrides();
      return;
    }
    if (
      !effectiveNodes.some((node) => node.id === activeMoveGizmoNodeId) ||
      isNodeLocked(activeMoveGizmoNodeId)
    ) {
      clearDraftNodeCoordinateOverrides();
      setAxisOverride(null);
      setActiveMoveGizmoNodeId(null);
    }
  }, [
    activeMoveGizmoNodeId,
    clearDraftNodeCoordinateOverrides,
    effectiveNodes,
    isNodeLocked,
  ]);

  useEffect(() => {
    if (activeMoveGizmoNodeId) {
      draftBaseCoordinateRef.current =
        nodes.find((node) => node.id === activeMoveGizmoNodeId)?.coordinate ??
        null;
      draftBaseScreenPositionRef.current = null;
      hoveredReferenceNodeIdRef.current = null;
    }
  }, [activeMoveGizmoNodeId, nodes]);

  useEffect(() => {
    onActiveMoveGizmoNodeIdChange?.(activeMoveGizmoNodeId);
  }, [activeMoveGizmoNodeId, onActiveMoveGizmoNodeIdChange]);

  useEffect(
    () => () => {
      if (
        draftPreviewAnimationFrameRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.cancelAnimationFrame(draftPreviewAnimationFrameRef.current);
      }
    },
    []
  );

  return {
    activeMoveGizmoNodeId,
    draftNodeCoordinateOverrides,
    effectiveLinkedNodeGroups,
    effectiveNodes,
    handleNodeLongPress,
    isMoveGizmoDragging,
    handleReferenceNodeClick,
    handleReferenceNodeHover,
    handleReferenceEdgeClick,
  } as const;
};
