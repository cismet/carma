import { useCallback, useMemo } from "react";
import type { Scene } from "@carma-cesium";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import { useAnnotationToolDraftStates } from "./use-annotation-tool-draft-states";
import {
  type AnnotationElevationDisplayMode,
  type AnnotationEntryRole,
  type AnnotationsStore,
  resolveNodeEditingDisabledNodeIds,
  selectSelectedAnnotationId,
  setSelectedAnnotationIds,
  useAnnotationsSelector,
} from "../store";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import {
  ANNOTATION_TOOL_PLUGIN_KINDS,
  type AnnotationToolDraftStore,
  type AnnotationToolRegistry,
} from "../registry";
import { VisualSurfaces } from "../render/VisualSurfaces";
import { useVisualLayers } from "../render/use-visual-layers";
import { useSelectionAdditiveModifierState } from "./use-selection-additive-modifier-state";
import { useAnnotationSelection } from "./use-annotation-selection";
import { ANNOTATIONS_HOST_DEFAULTS } from "./annotations-host-defaults";
import { SceneSelectionHost } from "./SceneSelectionHost";
import { useVisualInteraction } from "./use-visual-interaction";
import { selectRenderableAnnotationEntries } from "../utils/annotation-tool-collections";

type RuntimeVisualHostProps = {
  scene: Scene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  annotationToolDraftStore: AnnotationToolDraftStore;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (
    annotationId: string,
    currentElevationDisplayMode?: AnnotationElevationDisplayMode
  ) => void;
  onActiveEditedNodeIdChange: (nodeId: string | null) => void;
  onHoveredPointQueryNodeIdChange: (nodeId: string | null) => void;
  onPreviewSnapTargetNodeClick: (nodeId: string) => boolean;
  activeEditedNodeId: string | null;
  formatOptions: AnnotationsRuntimeFormatOptions;
  lineLabelOptions: PartialAnnotationLineLabelOptions;
  visualInteractionEnabled?: boolean;
  visualAnnotationEntryRoles?: readonly AnnotationEntryRole[];
};

export const RuntimeVisualHost = ({
  scene,
  registry,
  annotationsStore,
  annotationToolDraftStore,
  setElevationReferenceAnnotationId,
  toggleAnnotationElevationDisplayMode,
  onActiveEditedNodeIdChange,
  onHoveredPointQueryNodeIdChange,
  onPreviewSnapTargetNodeClick,
  activeEditedNodeId,
  formatOptions,
  lineLabelOptions,
  visualInteractionEnabled = false,
  visualAnnotationEntryRoles,
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
  const nodes = useAnnotationsSelector(
    (annotationsState) => annotationsState.nodes
  );
  const linkedNodeGroups = useAnnotationsSelector(
    (annotationsState) => annotationsState.linkedNodeGroups
  );
  const edges = useAnnotationsSelector(
    (annotationsState) => annotationsState.edges
  );
  const allAnnotationEntries = useAnnotationsSelector(
    (annotationsState) => annotationsState.annotationEntries
  );
  const annotationEntries = useMemo(() => {
    const renderableAnnotationEntries = selectRenderableAnnotationEntries(
      { annotationEntries: allAnnotationEntries },
      { roles: visualAnnotationEntryRoles }
    );
    return renderableAnnotationEntries.map((annotationEntry) =>
      annotationEntry.readOnly && !annotationEntry.locked
        ? { ...annotationEntry, locked: true }
        : annotationEntry
    );
  }, [allAnnotationEntries, visualAnnotationEntryRoles]);
  const selectedAnnotationId = useAnnotationsSelector(
    selectSelectedAnnotationId
  );
  const selectedAnnotationIds = useAnnotationsSelector(
    (annotationsState) => annotationsState.selectionState.selectedAnnotationIds
  );
  const draftToolTypes = useMemo<readonly AnnotationToolId[]>(
    () => registry.plugins.map((plugin) => plugin.id),
    [registry.plugins]
  );
  const draftStatesByToolType = useAnnotationToolDraftStates({
    draftStore: annotationToolDraftStore,
    toolTypes: draftToolTypes,
  });
  const elevationReferenceAnnotationId = useAnnotationsSelector(
    (annotationsState) =>
      annotationsState.settingsState.elevationReferenceAnnotationId
  );
  const isSelectionAdditiveModifierPressed = useSelectionAdditiveModifierState(
    ANNOTATIONS_HOST_DEFAULTS.additiveSelectionModifierKey
  );
  const handleAnnotationSelection = useAnnotationSelection({
    annotationsStore,
    isSelectionAdditiveModifierPressed,
  });
  const handleNodeAnnotationsSelection = useCallback(
    (annotationIds: readonly string[]) => {
      const normalizedAnnotationIds = Array.from(
        new Set(annotationIds.filter(Boolean))
      );
      if (normalizedAnnotationIds.length === 0) {
        return;
      }

      if (!isSelectionAdditiveModifierPressed) {
        annotationsStore.dispatch(
          setSelectedAnnotationIds(normalizedAnnotationIds)
        );
        return;
      }

      const currentlySelectedAnnotationIds =
        annotationsStore.getState().selectionState.selectedAnnotationIds;
      const normalizedAnnotationIdSet = new Set(normalizedAnnotationIds);
      const allNodeAnnotationsSelected = normalizedAnnotationIds.every(
        (annotationId) => currentlySelectedAnnotationIds.includes(annotationId)
      );
      const nextSelectedAnnotationIds = allNodeAnnotationsSelected
        ? currentlySelectedAnnotationIds.filter(
            (annotationId) => !normalizedAnnotationIdSet.has(annotationId)
          )
        : Array.from(
            new Set([
              ...currentlySelectedAnnotationIds,
              ...normalizedAnnotationIds,
            ])
          );

      annotationsStore.dispatch(
        setSelectedAnnotationIds(nextSelectedAnnotationIds)
      );
    },
    [annotationsStore, isSelectionAdditiveModifierPressed]
  );
  const nodeEditingDisabledNodeIds = useMemo(
    () => resolveNodeEditingDisabledNodeIds(annotationEntries),
    [annotationEntries]
  );
  const canStartNodeEditing = useCallback(
    (nodeId: string, annotationId?: string) =>
      !nodeEditingDisabledNodeIds.has(nodeId) &&
      annotationEntries.some(
        (annotationEntry) =>
          (!annotationId || annotationEntry.id === annotationId) &&
          annotationEntry.nodeIds.includes(nodeId) &&
          // Editing is gated behind selection (cismet/wupp#4078): the long-press
          // target is only attached to nodes of a selected measurement.
          selectedAnnotationIds.includes(annotationEntry.id) &&
          !annotationEntry.locked &&
          !annotationEntry.readOnly
      ),
    [annotationEntries, nodeEditingDisabledNodeIds, selectedAnnotationIds]
  );
  const {
    draftNodeCoordinateOverrides,
    effectiveLinkedNodeGroups,
    effectiveNodes,
    handleDistanceTriangleCornerClick,
    handleInsertNodeTargetClick,
    handleNodeLongPress,
    handlePreviewSnapTargetNodeHover,
    handleReferenceEdgeClick,
    handleReferenceNodeClick,
    handleReferenceNodeHover,
    insertNodeTargetAnnotationIds,
    isMoveGizmoDragging,
    previewSnapTargetHoverEnabled,
  } = useVisualInteraction({
    scene,
    nodes,
    linkedNodeGroups,
    annotationEntries,
    selectedAnnotationIds,
    annotationsStore,
    activeEditedNodeId,
    isInteractionToolActive,
    isMeasurementToolActive,
    isSelectionAdditiveModifierPressed,
    onActiveEditedNodeIdChange,
    onHoveredPointQueryNodeIdChange,
  });
  const { baseVisualModels, overlayVisualModels } = useVisualLayers({
    plugins: registry.plugins,
    nodes,
    edges,
    linkedNodeGroups,
    annotationEntries,
    draftStatesByToolType,
    elevationReferenceAnnotationId,
    selectedAnnotationId,
    selectedAnnotationIds,
    isSelectionAdditiveModifierPressed,
    onAnnotationSelect: handleAnnotationSelection,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    onNodeLongPress: handleNodeLongPress,
    formatOptions,
    draftNodeCoordinateOverrides,
    effectiveNodes,
    effectiveLinkedNodeGroups,
  });

  return (
    <>
      <SceneSelectionHost
        scene={scene}
        enabled={isInteractionToolActive || visualInteractionEnabled}
        baseEdges={baseVisualModels.edges ?? []}
        overlayEdges={overlayVisualModels?.edges ?? []}
        basePolygonFills={baseVisualModels.polygonFills ?? []}
        overlayPolygonFills={overlayVisualModels?.polygonFills ?? []}
        onAnnotationSelect={handleAnnotationSelection}
      />
      <VisualSurfaces
        scene={scene}
        baseVisualModels={baseVisualModels}
        overlayVisualModels={overlayVisualModels}
        linkedNodeGroups={linkedNodeGroups}
        effectiveLinkedNodeGroups={effectiveLinkedNodeGroups}
        selectedAnnotationIds={selectedAnnotationIds}
        formatOptions={formatOptions}
        lineLabelOptions={lineLabelOptions}
        activeEditedNodeId={activeEditedNodeId}
        isMoveGizmoDragging={isMoveGizmoDragging}
        isMeasurementToolActive={isMeasurementToolActive}
        previewSnapTargetHoverEnabled={previewSnapTargetHoverEnabled}
        onPreviewSnapTargetNodeClick={onPreviewSnapTargetNodeClick}
        onAnnotationSelect={handleAnnotationSelection}
        onNodeAnnotationsSelect={handleNodeAnnotationsSelection}
        onNodeLongPress={handleNodeLongPress}
        canStartNodeEditing={canStartNodeEditing}
        onReferenceNodeClick={handleReferenceNodeClick}
        onReferenceNodeHover={handleReferenceNodeHover}
        onPreviewNodeHover={handlePreviewSnapTargetNodeHover}
        onReferenceEdgeClick={handleReferenceEdgeClick}
        insertNodeTargetAnnotationIds={insertNodeTargetAnnotationIds}
        onInsertNodeTargetClick={handleInsertNodeTargetClick}
        onDistanceTriangleCornerClick={handleDistanceTriangleCornerClick}
      />
    </>
  );
};
