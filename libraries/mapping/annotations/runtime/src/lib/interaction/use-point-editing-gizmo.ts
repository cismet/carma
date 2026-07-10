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
import { useLabelOverlay } from "@carma-providers/label-overlay";
import { Cartesian3, type Scene } from "@carma-cesium";

import {
  ANNOTATION_REFERENCE_OBJECT_SIZING_DEFAULTS,
  type AnnotationReferenceObjectSizingOptions,
} from "../config/annotation-reference-object-sizing";
import {
  resolveAnnotationNodeMoveScope,
  resolveNextNodeLinksForNodeMove,
  updateNodeCoordinateById,
  type AnnotationsStore,
  type AnnotationNodeLink,
  type CesiumGeographicCoordinate,
  type AnnotationNode,
  type StoredAnnotation,
} from "../store";
import {
  applyNodeCoordinateOverridesToNodes,
  areNodeCoordinateOverridesEqual,
  EMPTY_NODE_COORDINATE_OVERRIDES,
  hasNodeCoordinateOverrides,
  type NodeCoordinateOverrides,
} from "../utils/node-coordinate-overrides";
import { resolveNodeSnapSample } from "./lifecycle/node-snap.helpers";

const { AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR } = ANNOTATION_TYPES;

// React readouts (area/length, counts) are paced to ~5 Hz; live geometry tracks
// the pointer every frame via liveAnchors.
const DRAFT_PREVIEW_FLUSH_INTERVAL_MS = 200;

const POINT_EDITING_GIZMO_DEFAULTS = {
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
  onActiveEditedNodeIdChange?: (nodeId: string | null) => void;
  referenceObjectSizing?: AnnotationReferenceObjectSizingOptions;
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
    nodes.map(
      (node) =>
        [node.id, cartesian3FromGeographicCoordinate(node.coordinate)] as const
    )
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

export const usePointEditingGizmo = (
  scene: Scene | null,
  nodes: readonly AnnotationNode[],
  linkedNodeGroups: readonly AnnotationNodeLink[],
  {
    annotationsStore,
    annotationEntries,
    selectedAnnotationIds,
    onActiveEditedNodeIdChange,
    referenceObjectSizing = ANNOTATION_REFERENCE_OBJECT_SIZING_DEFAULTS,
  }: UsePointEditingGizmoOptions
) => {
  const { liveAnchors } = useLabelOverlay();
  const [activeEditedNodeId, setActiveEditedNodeId] = useState<string | null>(
    null
  );
  const [isMoveGizmoDragging, setIsMoveGizmoDragging] = useState(false);
  const [axisOverride, setAxisOverride] =
    useState<MoveGizmoAxisOverride | null>(null);
  const [draftNodeCoordinateOverrides, setDraftNodeCoordinateOverrides] =
    useState<NodeCoordinateOverrides>(EMPTY_NODE_COORDINATE_OVERRIDES);
  const [draftLinkToNodeId, setDraftLinkToNodeId] = useState<string | null>(
    null
  );
  const draftNodeCoordinateOverridesRef = useRef<NodeCoordinateOverrides>(
    EMPTY_NODE_COORDINATE_OVERRIDES
  );
  const draftLinkToNodeIdRef = useRef<string | null>(null);
  const draftFlushTimeoutRef = useRef<number | null>(null);
  const lastDraftFlushAtRef = useRef(0);
  const snappedNodeIdRef = useRef<string | null>(null);
  const draftBaseCoordinateRef = useRef<CesiumGeographicCoordinate | null>(
    null
  );
  const draftBaseScreenPositionRef = useRef<CesiumGizmoScreenPosition | null>(
    null
  );
  const hoveredReferenceNodeIdRef = useRef<string | null>(null);
  const isMoveGizmoDraggingRef = useRef(false);
  const suppressReferenceInteractionsUntilRef = useRef(0);
  const activePlanarAreaEditPlane = useMemo(
    () =>
      activeEditedNodeId
        ? resolvePlanarAreaEditPlane({
            nodeId: activeEditedNodeId,
            nodes,
            annotationEntries,
            selectedAnnotationIds,
          })
        : null,
    [activeEditedNodeId, annotationEntries, nodes, selectedAnnotationIds]
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
    draftFlushTimeoutRef.current = null;
    lastDraftFlushAtRef.current =
      typeof performance !== "undefined" ? performance.now() : 0;
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
    if (draftFlushTimeoutRef.current !== null) {
      return;
    }

    if (typeof window === "undefined") {
      flushDraftPreviewState();
      return;
    }

    // Trailing throttle: at most one React flush per interval. Pointer moves
    // arriving within the interval are coalesced into the trailing flush; the
    // live geometry stays at frame rate via liveAnchors regardless.
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const elapsed = now - lastDraftFlushAtRef.current;
    const delay = Math.max(0, DRAFT_PREVIEW_FLUSH_INTERVAL_MS - elapsed);
    draftFlushTimeoutRef.current = window.setTimeout(() => {
      flushDraftPreviewState();
    }, delay);
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
      draftFlushTimeoutRef.current !== null &&
      typeof window !== "undefined"
    ) {
      window.clearTimeout(draftFlushTimeoutRef.current);
      draftFlushTimeoutRef.current = null;
    }

    draftNodeCoordinateOverridesRef.current = EMPTY_NODE_COORDINATE_OVERRIDES;
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
          selectedAnnotationIds: selectedAnnotationIds,
        })
      );
      clearDraftNodeCoordinateOverrides();
    },
    [
      annotationsStore,
      clearDraftNodeCoordinateOverrides,
      draftNodeCoordinateOverrides,
      selectedAnnotationIds,
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
        selectedAnnotationIds: selectedAnnotationIds,
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

        // Publish all moved nodes on the shared live-anchor registry so the
        // measurement visualizers patch their geometry this frame, in lockstep
        // with the gizmo disc, ahead of the draft-state round-trip. The gizmo
        // clears the registry once React has committed.
        const liveAnchorECEF = cartesian3FromGeographicCoordinate(
          constrainedCoordinate
        );
        movedNodeIds.forEach((movedNodeId) => {
          liveAnchors.set(movedNodeId, liveAnchorECEF);
        });

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

      // See the disableSnap branch: publish the resolved (snapped) position for
      // all moved nodes on the shared live-anchor registry.
      const liveAnchorECEF = cartesian3FromGeographicCoordinate(
        resolvedNodeSnapSample.coordinate
      );
      movedNodeIds.forEach((movedNodeId) => {
        liveAnchors.set(movedNodeId, liveAnchorECEF);
      });

      updateDraftPreviewState({
        nextDraftNodeCoordinateOverrides,
        nextDraftLinkToNodeId: resolvedNodeSnapSample.snappedNodeId,
      });
    },
    [
      activePlanarAreaEditPlane,
      annotationsStore,
      linkedNodeGroups,
      liveAnchors,
      nodes,
      scene,
      selectedAnnotationIds,
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
      applyNodeCoordinateOverridesToNodes(nodes, draftNodeCoordinateOverrides),
    [draftNodeCoordinateOverrides, nodes]
  );
  const effectiveLinkedNodeGroups = useMemo(() => {
    const movedNodeIds = Object.keys(draftNodeCoordinateOverrides);
    const moveScopeNodeId = activeEditedNodeId ?? movedNodeIds[0] ?? null;
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
    activeEditedNodeId,
    draftLinkToNodeId,
    draftNodeCoordinateOverrides,
    effectiveNodes,
    linkedNodeGroups,
  ]);

  const handleNodeLongPress = useCallback(
    (nodeId: string) => {
      const isEditableSelectedNode = annotationEntries.some(
        (annotation) =>
          annotation.nodeIds.includes(nodeId) &&
          selectedAnnotationIds.includes(annotation.id) &&
          !annotation.locked &&
          !annotation.readOnly
      );
      if (!isEditableSelectedNode) {
        return;
      }

      if (activeEditedNodeId && activeEditedNodeId !== nodeId) {
        commitDraftNodeCoordinateOverrides(activeEditedNodeId);
      }

      setAxisOverride(null);
      setActiveEditedNodeId(nodeId);
    },
    [
      activeEditedNodeId,
      annotationEntries,
      commitDraftNodeCoordinateOverrides,
      selectedAnnotationIds,
    ]
  );

  const nodesById = useMemo(
    () => new Map(effectiveNodes.map((node) => [node.id, node] as const)),
    [effectiveNodes]
  );

  const handleReferenceNodeClick = useCallback(
    (referenceNodeId: string) => {
      if (!activeEditedNodeId || areReferenceInteractionsSuppressed()) {
        return false;
      }

      const activeNode = nodesById.get(activeEditedNodeId);
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
      activeEditedNodeId,
      areReferenceInteractionsSuppressed,
      nodesById,
      setDraftCoordinateForScopedMove,
    ]
  );

  const handleReferenceNodeHover = useCallback(
    (referenceNodeId: string, hovered: boolean) => {
      if (!activeEditedNodeId || areReferenceInteractionsSuppressed()) {
        return;
      }

      const baseCoordinate = resolveDraftBaseCoordinate(activeEditedNodeId);
      const referenceNode = nodesById.get(referenceNodeId);
      if (!baseCoordinate) {
        return;
      }

      if (hovered) {
        hoveredReferenceNodeIdRef.current = referenceNodeId;
        setDraftCoordinateForScopedMove(
          activeEditedNodeId,
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
      setDraftCoordinateForScopedMove(activeEditedNodeId, baseCoordinate, {
        screenPosition: draftBaseScreenPositionRef.current ?? undefined,
        disableSnap: true,
      });
    },
    [
      activeEditedNodeId,
      areReferenceInteractionsSuppressed,
      nodesById,
      resolveDraftBaseCoordinate,
      setDraftCoordinateForScopedMove,
    ]
  );

  const handleReferenceEdgeClick = useCallback(
    (startNodeId: string, endNodeId: string) => {
      if (!activeEditedNodeId || areReferenceInteractionsSuppressed()) {
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
    [activeEditedNodeId, areReferenceInteractionsSuppressed, nodesById]
  );

  const handleGizmoDragStateChange = useCallback(
    (isDragging: boolean) => {
      isMoveGizmoDraggingRef.current = isDragging;
      setIsMoveGizmoDragging((currentIsMoveGizmoDragging) =>
        currentIsMoveGizmoDragging === isDragging
          ? currentIsMoveGizmoDragging
          : isDragging
      );
      if (isDragging || !activeEditedNodeId) {
        if (isDragging) {
          suppressReferenceInteractionsUntilRef.current = 0;
        }
        return;
      }

      suppressReferenceInteractionsUntilRef.current =
        Date.now() +
        POINT_EDITING_GIZMO_DEFAULTS.referenceNodeInteractionReleaseGuardMs;
      commitDraftNodeCoordinateOverrides(activeEditedNodeId);
    },
    [activeEditedNodeId, commitDraftNodeCoordinateOverrides]
  );

  const gizmoPoints = useMemo(
    () =>
      effectiveNodes.map((node) => ({
        id: node.id,
        geometryECEF: cartesian3FromGeographicCoordinate(node.coordinate),
      })),
    [effectiveNodes]
  );

  const handleGizmoPointPositionChange = useCallback(
    (
      nodeId: string,
      nextPosition: Cartesian3,
      screenPosition?: CesiumGizmoScreenPosition
    ) => {
      setDraftCoordinateForScopedMove(
        nodeId,
        geographicCoordinateFromCartesian3(nextPosition),
        {
          screenPosition,
          rememberBaseCoordinate: true,
        }
      );
    },
    [setDraftCoordinateForScopedMove]
  );

  useCesiumPointMoveGizmo(scene, {
    points: gizmoPoints,
    movePointId: activeEditedNodeId,
    axisDirection: axisOverride?.axisDirection ?? null,
    discPlaneNormal: activePlanarAreaDiscNormal,
    axisTitle: axisOverride?.axisTitle ?? null,
    preferredAxisId: axisOverride?.preferredAxisId ?? null,
    axisCandidates: axisOverride?.axisCandidates ?? null,
    radius: referenceObjectSizing.worldRadiusMeters,
    discScalingMode: referenceObjectSizing.scalingMode,
    discOutlineScreenPixelRadius: referenceObjectSizing.targetScreenRadiusCssPx,
    discResizeWorldRadiusToScreenTarget:
      referenceObjectSizing.resizeWorldRadiusToScreenTarget,
    discQuantizeWorldRadius: referenceObjectSizing.quantizeWorldRadius,
    freezeDiscScaleDuringDrag:
      referenceObjectSizing.resizeWorldRadiusToScreenTarget,
    discResizeStepFactor: referenceObjectSizing.resizeStepFactor,
    showRotationHandle: false,
    snapPlaneDragToGround: activePlanarAreaEditPlane === null,
    onDragStateChange: handleGizmoDragStateChange,
    onPointPositionChange: handleGizmoPointPositionChange,
    onExit: () => {
      commitDraftNodeCoordinateOverrides(activeEditedNodeId);
      isMoveGizmoDraggingRef.current = false;
      setIsMoveGizmoDragging(false);
      setAxisOverride(null);
      setActiveEditedNodeId(null);
    },
  });

  useEffect(() => {
    if (!activeEditedNodeId) {
      clearDraftNodeCoordinateOverrides();
      return;
    }
    if (!effectiveNodes.some((node) => node.id === activeEditedNodeId)) {
      clearDraftNodeCoordinateOverrides();
      setAxisOverride(null);
      setActiveEditedNodeId(null);
    }
  }, [activeEditedNodeId, clearDraftNodeCoordinateOverrides, effectiveNodes]);

  // Commit before leaving when selection changes; node removal is handled above
  // and intentionally clears without committing.
  useEffect(() => {
    if (!activeEditedNodeId) {
      return;
    }
    if (!nodes.some((node) => node.id === activeEditedNodeId)) {
      return;
    }

    const isEditedMeasurementSelected = annotationEntries.some(
      (annotation) =>
        annotation.nodeIds.includes(activeEditedNodeId) &&
        selectedAnnotationIds.includes(annotation.id)
    );
    if (isEditedMeasurementSelected) {
      return;
    }

    commitDraftNodeCoordinateOverrides(activeEditedNodeId);
    setAxisOverride(null);
    setActiveEditedNodeId(null);
  }, [
    activeEditedNodeId,
    annotationEntries,
    commitDraftNodeCoordinateOverrides,
    nodes,
    selectedAnnotationIds,
  ]);

  useEffect(() => {
    if (activeEditedNodeId) {
      draftBaseCoordinateRef.current =
        nodes.find((node) => node.id === activeEditedNodeId)?.coordinate ??
        null;
      draftBaseScreenPositionRef.current = null;
      hoveredReferenceNodeIdRef.current = null;
    }
  }, [activeEditedNodeId, nodes]);

  useEffect(() => {
    onActiveEditedNodeIdChange?.(activeEditedNodeId);
  }, [activeEditedNodeId, onActiveEditedNodeIdChange]);

  useEffect(
    () => () => {
      if (
        draftFlushTimeoutRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.clearTimeout(draftFlushTimeoutRef.current);
      }
    },
    []
  );

  return {
    activeEditedNodeId,
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
