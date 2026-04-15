import { useCallback, useEffect, useMemo } from "react";
import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
} from "@carma-cesium";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
import { useCursorOverlay } from "../interaction/use-cursor-overlay";
import { usePointEditingGizmo } from "../interaction/use-point-editing-gizmo";
import {
  type AnnotationsStore,
  findAnnotationEntryById,
  selectSelectedAnnotationId,
  updateAnnotationEntryById,
  useAnnotationsSelector,
} from "../store";
import { ANNOTATION_TOOL_PLUGIN_KINDS } from "../tools";
import type { AnnotationToolRegistry } from "../tools/annotation-tool-plugin.types";
import type { RuntimeScene } from "../types/runtime-scene.types";
import { RUNTIME_POINT_LABEL_COORDINATE_SELECTION } from "../render/measurement-render-models";
import { useRuntimeVisualizers } from "../render/use-runtime-visualizers";
import { useRuntimeVisualLayers } from "../render/use-runtime-visual-layers";
import {
  resolveDistanceTriangleAnchorCoordinateRole,
  resolveDistanceTriangleAnchorCoordinateSelection,
  resolveOppositeDistanceTriangleAnchorCoordinateRole,
} from "../render/runtime-distance-triangle-overlay";
import { resolveAnnotationEntryCoordinates } from "../utils/runtime-annotation-coordinates";
import { useSelectionAdditiveModifierState } from "./use-selection-additive-modifier-state";
import { useRuntimeAnnotationSelection } from "./use-runtime-annotation-selection";
import { ANNOTATIONS_RUNTIME_HOST_DEFAULTS } from "./annotations-runtime-host-defaults";
import { isRuntimeSceneSelectionTarget } from "./runtime-scene-selection-target";

type RuntimeVisualHostProps = {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (annotationId: string) => void;
  onActiveMoveGizmoNodeIdChange: (nodeId: string | null) => void;
  onHoveredPointQueryNodeIdChange: (nodeId: string | null) => void;
  onPreviewSnapTargetNodeClick: (nodeId: string) => boolean;
  activeMoveGizmoNodeId: string | null;
  cursorOverlayVisible: boolean;
  blockCommittedLabelInteractions: boolean;
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions: Partial<PreviewLineLabelVisualOptions>;
};

export const RuntimeVisualHost = ({
  scene,
  registry,
  annotationsStore,
  setElevationReferenceAnnotationId,
  toggleAnnotationElevationDisplayMode,
  onActiveMoveGizmoNodeIdChange,
  onHoveredPointQueryNodeIdChange,
  onPreviewSnapTargetNodeClick,
  activeMoveGizmoNodeId,
  cursorOverlayVisible,
  blockCommittedLabelInteractions,
  formatOptions,
  previewLineLabelVisualOptions,
}: RuntimeVisualHostProps) => {
  const activeToolType = useAnnotationsSelector(
    (annotationsState) => annotationsState.annotationToolType
  );
  const activePlugin = useMemo(
    () => registry.getPlugin(activeToolType) ?? null,
    [activeToolType, registry]
  );
  const isInteractionToolActive =
    activePlugin?.kind === ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION;
  const isMeasurementToolActive =
    activePlugin?.kind === ANNOTATION_TOOL_PLUGIN_KINDS.MEASUREMENT;
  const previewSnapTargetHoverEnabled =
    activeMoveGizmoNodeId === null && isMeasurementToolActive;
  const nodes = useAnnotationsSelector(
    (annotationsState) => annotationsState.nodes
  );
  const linkedNodeGroups = useAnnotationsSelector(
    (annotationsState) => annotationsState.linkedNodeGroups
  );
  const edges = useAnnotationsSelector(
    (annotationsState) => annotationsState.edges
  );
  const annotationEntries = useAnnotationsSelector(
    (annotationsState) => annotationsState.annotationEntries
  );
  const selectedAnnotationId = useAnnotationsSelector(
    selectSelectedAnnotationId
  );
  const selectedAnnotationIds = useAnnotationsSelector(
    (annotationsState) => annotationsState.selectionState.selectedAnnotationIds
  );
  const elevationReferenceAnnotationId = useAnnotationsSelector(
    (annotationsState) =>
      annotationsState.settingsState.elevationReferenceAnnotationId
  );
  const isSelectionAdditiveModifierPressed = useSelectionAdditiveModifierState(
    ANNOTATIONS_RUNTIME_HOST_DEFAULTS.additiveSelectionModifierKey
  );
  const {
    draftNodeCoordinateOverrides,
    effectiveLinkedNodeGroups,
    effectiveNodes,
    handleNodeLongPress,
    isMoveGizmoDragging,
    handleReferenceNodeClick,
    handleReferenceNodeHover,
    handleReferenceEdgeClick,
  } = usePointEditingGizmo(scene, nodes, linkedNodeGroups, {
    annotationsStore,
    onActiveMoveGizmoNodeIdChange,
  });
  const handleDistanceTriangleCornerClick = useCallback(
    (measurementId: string) => {
      const runtimeState = annotationsStore.getState();
      const targetEntry = findAnnotationEntryById(
        runtimeState.annotationEntries,
        measurementId
      );
      if (!targetEntry) {
        return;
      }

      const coordinates = resolveAnnotationEntryCoordinates({
        annotationEntries: runtimeState.annotationEntries,
        nodes: runtimeState.nodes,
        annotationId: measurementId,
      });

      const currentTriangleAnchorCoordinateRole =
        targetEntry.distanceTriangleAnchorCoordinateRole ??
        resolveDistanceTriangleAnchorCoordinateRole(coordinates);

      const nextSelection =
        (targetEntry.distanceAnchorCoordinateSelection ??
          resolveDistanceTriangleAnchorCoordinateSelection(coordinates)) ===
        RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
          ? RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE
          : RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE;

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId: measurementId,
          distanceAnchorCoordinateSelection: nextSelection,
          distanceTriangleAnchorCoordinateRole:
            resolveOppositeDistanceTriangleAnchorCoordinateRole(
              currentTriangleAnchorCoordinateRole
            ),
        })
      );
    },
    [annotationsStore]
  );
  const handleMeasurementSelection = useRuntimeAnnotationSelection({
    annotationsStore,
    isSelectionAdditiveModifierPressed,
  });
  const handlePreviewSnapTargetNodeHover = useCallback(
    (nodeId: string, hovered: boolean) => {
      onHoveredPointQueryNodeIdChange(hovered ? nodeId : null);
    },
    [onHoveredPointQueryNodeIdChange]
  );

  useEffect(() => {
    if (previewSnapTargetHoverEnabled) {
      return;
    }

    onHoveredPointQueryNodeIdChange(null);
  }, [onHoveredPointQueryNodeIdChange, previewSnapTargetHoverEnabled]);

  const runtimeVisualLayers = useRuntimeVisualLayers({
    plugins: registry.plugins,
    nodes,
    edges,
    linkedNodeGroups,
    annotationEntries,
    elevationReferenceAnnotationId,
    selectedAnnotationId,
    selectedAnnotationIds,
    isSelectionAdditiveModifierPressed,
    onMeasurementSelect: handleMeasurementSelection,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    onNodeLongPress: handleNodeLongPress,
    formatOptions,
    draftNodeCoordinateOverrides,
    effectiveNodes,
    effectiveLinkedNodeGroups,
  });
  const overlayVisualModels = runtimeVisualLayers.overlayVisualModels ?? null;

  const runtimeSceneSelectionEdgeIdSet = useMemo(
    () =>
      new Set(
        [
          ...(runtimeVisualLayers.baseVisualModels.edges ?? []),
          ...(overlayVisualModels?.edges ?? []),
        ].map((edge) => edge.id)
      ),
    [overlayVisualModels?.edges, runtimeVisualLayers.baseVisualModels.edges]
  );
  const runtimeSceneSelectionPolygonFillIdSet = useMemo(
    () =>
      new Set(
        [
          ...(runtimeVisualLayers.baseVisualModels.polygonFills ?? []),
          ...(overlayVisualModels?.polygonFills ?? []),
        ].map((polygonFill) => polygonFill.id)
      ),
    [
      overlayVisualModels?.polygonFills,
      runtimeVisualLayers.baseVisualModels.polygonFills,
    ]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !isInteractionToolActive) {
      return;
    }

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (
        annotationsStore.getState().selectionState.selectedAnnotationIds
          .length === 0
      ) {
        return;
      }

      const pickedObject = scene.pick(event.position);
      if (
        isRuntimeSceneSelectionTarget({
          pickedObject,
          edgeIds: runtimeSceneSelectionEdgeIdSet,
          polygonFillIds: runtimeSceneSelectionPolygonFillIdSet,
        })
      ) {
        return;
      }

      handleMeasurementSelection(null);
      scene.requestRender();
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [
    annotationsStore,
    handleMeasurementSelection,
    isInteractionToolActive,
    runtimeSceneSelectionEdgeIdSet,
    runtimeSceneSelectionPolygonFillIdSet,
    scene,
  ]);

  useRuntimeVisualizers(scene, {
    surfaceKey: "committed",
    enableHostInteractionTargets: true,
    points: runtimeVisualLayers.baseVisualModels.points ?? [],
    linkedNodeGroups,
    edges: runtimeVisualLayers.baseVisualModels.edges ?? [],
    polygonFills: runtimeVisualLayers.baseVisualModels.polygonFills ?? [],
    pointLabels: runtimeVisualLayers.baseVisualModels.pointLabels ?? [],
    selectedAnnotationIds,
    formatOptions,
    previewLineLabelVisualOptions,
    activeMoveGizmoNodeId,
    isMoveGizmoDragging,
    blockLabelInteractions:
      blockCommittedLabelInteractions ||
      activeMoveGizmoNodeId !== null ||
      isMeasurementToolActive,
    previewSnapTargetHoverEnabled,
    onPreviewSnapTargetNodeClick,
    onMeasurementSelect: handleMeasurementSelection,
    onNodeLongPress: handleNodeLongPress,
    onReferenceNodeClick: handleReferenceNodeClick,
    onReferenceNodeHover:
      activeMoveGizmoNodeId !== null
        ? handleReferenceNodeHover
        : handlePreviewSnapTargetNodeHover,
    onReferenceEdgeClick: handleReferenceEdgeClick,
    onDistanceTriangleCornerClick: handleDistanceTriangleCornerClick,
  });

  useRuntimeVisualizers(scene, {
    surfaceKey: "preview",
    enableHostInteractionTargets: false,
    points: overlayVisualModels?.points ?? [],
    linkedNodeGroups: effectiveLinkedNodeGroups,
    edges: overlayVisualModels?.edges ?? [],
    polygonFills: overlayVisualModels?.polygonFills ?? [],
    pointLabels: overlayVisualModels?.pointLabels ?? [],
    selectedAnnotationIds,
    formatOptions,
    previewLineLabelVisualOptions,
    activeMoveGizmoNodeId,
    isMoveGizmoDragging,
    blockLabelInteractions: true,
  });

  useCursorOverlay(scene, null, {
    enabled: cursorOverlayVisible,
  });
  useCursorOverlay(scene, null, {
    enabled: isInteractionToolActive && isSelectionAdditiveModifierPressed,
    variant: "selection-additive-indicator",
  });

  return null;
};
