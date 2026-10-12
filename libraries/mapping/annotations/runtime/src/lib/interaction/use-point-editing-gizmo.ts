import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Vector3 } from "three";
import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
  vector3FromMetricVector3,
} from "@carma-geo/proj";

import type {
  AnnotationEngine,
  AnnotationPointMoveGizmoOptions,
  AnnotationScreenPosition,
} from "@carma-mapping/annotations/core";
import {
  ANNOTATION_REFERENCE_OBJECT_SIZING_DEFAULTS,
  type AnnotationReferenceObjectSizingOptions,
} from "../config/annotation-reference-object-sizing";
import {
  resolveNextNodeLinksForNodeMove,
  type AnnotationsStore,
  type AnnotationNodeLink,
  type AnnotationNode,
  type StoredAnnotation,
} from "../store";
import {
  applyNodeCoordinateOverridesToNodes,
  hasNodeCoordinateOverrides,
} from "../utils/node-coordinate-overrides";
import {
  resolveAnnotationNodeEditRule,
  resolveEditedMeasurementForNode,
} from "./annotation-node-edit-rules";
import {
  createLiveAnnotationAnchors,
  type LiveAnnotationAnchors,
} from "./live-annotation-anchors";
import { resolveMeasurementEditPlane } from "./measurement-edit-plane";
import { POINT_EDITING_GIZMO_DEFAULTS } from "./point-editing-gizmo-defaults";
import { shouldExcludeOwnGeometryFromPointEditSurfacePick } from "./point-editing-surface-pick-policy";
import type { MoveGizmoAxisOverride } from "./reference-line-axis-override";
import { useDraftNodePreview } from "./use-draft-node-preview";
import { useReferenceNodeInteractions } from "./use-reference-node-interactions";
import { useScopedNodeMove } from "./use-scoped-node-move";

type UsePointEditingGizmoOptions = {
  annotationsStore: AnnotationsStore;
  annotationEntries: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
  onActiveEditedNodeIdChange?: (nodeId: string | null) => void;
  referenceObjectSizing?: AnnotationReferenceObjectSizingOptions;
  liveAnchors?: LiveAnnotationAnchors;
};

// The engine is fixed for the host lifetime, so the resolved gizmo hook never
// changes within a mounted host and the hook order stays stable.
const useNoopPointMoveGizmo = (_options: AnnotationPointMoveGizmoOptions) =>
  undefined;

export const usePointEditingGizmo = (
  engine: AnnotationEngine | null,
  nodes: readonly AnnotationNode[],
  linkedNodeGroups: readonly AnnotationNodeLink[],
  {
    annotationsStore,
    annotationEntries,
    selectedAnnotationIds,
    onActiveEditedNodeIdChange,
    referenceObjectSizing = ANNOTATION_REFERENCE_OBJECT_SIZING_DEFAULTS,
    liveAnchors: providedLiveAnchors,
  }: UsePointEditingGizmoOptions
) => {
  const fallbackLiveAnchors = useMemo(
    () => createLiveAnnotationAnchors(() => undefined),
    []
  );
  const liveAnchors = providedLiveAnchors ?? fallbackLiveAnchors;
  const [activeEditedNodeId, setActiveEditedNodeId] = useState<string | null>(
    null
  );
  const [isMoveGizmoDragging, setIsMoveGizmoDragging] = useState(false);
  const [axisOverride, setAxisOverride] =
    useState<MoveGizmoAxisOverride | null>(null);
  const isMoveGizmoDraggingRef = useRef(false);
  const suppressReferenceInteractionsUntilRef = useRef(0);
  const {
    draftNodeCoordinateOverrides,
    draftLinkToNodeId,
    snappedNodeIdRef,
    draftBaseCoordinateRef,
    draftBaseScreenPositionRef,
    hoveredReferenceNodeIdRef,
    updateDraftPreviewState,
    clearDraftNodeCoordinateOverrides,
    commitDraftNodeCoordinateOverrides,
  } = useDraftNodePreview({ annotationsStore, selectedAnnotationIds });
  // The rule of the measurement being edited decides the node's degrees of
  // freedom, see annotation-node-edit-rules.
  const activeEditedMeasurement = useMemo(
    () =>
      activeEditedNodeId
        ? resolveEditedMeasurementForNode(
            activeEditedNodeId,
            annotationEntries,
            selectedAnnotationIds
          )
        : null,
    [activeEditedNodeId, annotationEntries, selectedAnnotationIds]
  );
  const activeNodeEditRule = useMemo(
    () => resolveAnnotationNodeEditRule(activeEditedMeasurement?.toolType),
    [activeEditedMeasurement]
  );
  const activeMeasurementEditPlane = useMemo(
    () =>
      activeEditedMeasurement && activeNodeEditRule.projectOntoMeasurementPlane
        ? resolveMeasurementEditPlane(activeEditedMeasurement, nodes)
        : null,
    [activeEditedMeasurement, activeNodeEditRule, nodes]
  );
  const activeMeasurementPlaneNormal = useMemo(
    () =>
      activeMeasurementEditPlane
        ? vector3FromMetricVector3(activeMeasurementEditPlane.normalECEF)
        : null,
    [activeMeasurementEditPlane]
  );
  const excludeOwnGeometryFromSurfacePick = useMemo(
    () =>
      shouldExcludeOwnGeometryFromPointEditSurfacePick({
        activeEditedNodeId,
        annotationEntries,
        selectedAnnotationIds,
      }),
    [activeEditedNodeId, annotationEntries, selectedAnnotationIds]
  );
  const areReferenceInteractionsSuppressed = useCallback(
    () =>
      isMoveGizmoDraggingRef.current ||
      Date.now() < suppressReferenceInteractionsUntilRef.current,
    []
  );

  const setDraftCoordinateForScopedMove = useScopedNodeMove({
    engine,
    nodes,
    linkedNodeGroups,
    annotationsStore,
    selectedAnnotationIds,
    measurementEditPlane: activeMeasurementEditPlane,
    liveAnchors,
    updateDraftPreviewState,
    snappedNodeIdRef,
    draftBaseCoordinateRef,
    draftBaseScreenPositionRef,
    hoveredReferenceNodeIdRef,
  });

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
  const nodesById = useMemo(
    () => new Map(effectiveNodes.map((node) => [node.id, node] as const)),
    [effectiveNodes]
  );

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

  const {
    handleReferenceNodeClick,
    handleReferenceNodeHover,
    handleReferenceEdgeClick,
  } = useReferenceNodeInteractions({
    activeEditedNodeId,
    activeNodeEditRule,
    nodes,
    nodesById,
    areReferenceInteractionsSuppressed,
    setDraftCoordinateForScopedMove,
    setAxisOverride,
    draftBaseCoordinateRef,
    draftBaseScreenPositionRef,
    hoveredReferenceNodeIdRef,
  });

  const handleGizmoDragStateChange = useCallback(
    (isDragging: boolean) => {
      isMoveGizmoDraggingRef.current = isDragging;
      setIsMoveGizmoDragging(isDragging);
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
        geometryECEF: ecefFromGeographicCoordinate(node.coordinate),
      })),
    [effectiveNodes]
  );

  const handleGizmoPointPositionChange = useCallback(
    (
      nodeId: string,
      nextPosition: Vector3,
      screenPosition?: AnnotationScreenPosition
    ) => {
      setDraftCoordinateForScopedMove(
        nodeId,
        geographicCoordinateFromEcef(nextPosition),
        { screenPosition, rememberBaseCoordinate: true }
      );
    },
    [setDraftCoordinateForScopedMove]
  );

  const usePointMoveGizmo =
    engine?.hooks.usePointMoveGizmo ?? useNoopPointMoveGizmo;
  usePointMoveGizmo({
    points: gizmoPoints,
    labels: POINT_EDITING_GIZMO_DEFAULTS.labels,
    movePointId: activeEditedNodeId,
    axisDirection: axisOverride?.axisDirection ?? null,
    discPlaneNormal: activeMeasurementPlaneNormal,
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
    showAxes: activeNodeEditRule.axes,
    snapPlaneDragToGround: activeNodeEditRule.surfaceDrag,
    excludeRegisteredDragSampleOccluders: excludeOwnGeometryFromSurfacePick,
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

  // Commit before leaving when the selection changes; a removed node is
  // handled above and clears without committing.
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
  }, [
    activeEditedNodeId,
    draftBaseCoordinateRef,
    draftBaseScreenPositionRef,
    hoveredReferenceNodeIdRef,
    nodes,
  ]);

  useEffect(() => {
    onActiveEditedNodeIdChange?.(activeEditedNodeId);
  }, [activeEditedNodeId, onActiveEditedNodeIdChange]);

  useEffect(() => {
    if (
      isMoveGizmoDragging ||
      hasNodeCoordinateOverrides(draftNodeCoordinateOverrides)
    ) {
      return;
    }
    liveAnchors.clear();
    if (engine && !engine.isDestroyed()) {
      engine.requestRender();
    }
  }, [draftNodeCoordinateOverrides, isMoveGizmoDragging, liveAnchors, engine]);

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
