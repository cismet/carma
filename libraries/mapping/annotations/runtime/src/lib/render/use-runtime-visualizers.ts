import { useCallback, useMemo } from "react";

import { usePointMarkerVisualizer } from "./runtime-point-marker-visualizer";
import { usePointLabelVisualizer } from "./runtime-point-label-visualizer";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillRenderModel,
} from "./measurement-render-models";
import { useRuntimeMeasurementEdgesController } from "./use-runtime-measurement-edges-controller";
import { useRuntimeMeasurementPolygonFillsController } from "./use-runtime-measurement-polygon-fills-controller";
import type { RuntimeScene } from "../types/runtime-scene.types";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { RuntimeNodeLink } from "../store";
import { buildNodeLinkIdByNodeId } from "../store";
import {
  resolvePreviewLineLabelVisualOptions,
  type PreviewLineLabelVisualOptions,
} from "../config/preview-line-label-visual-defaults";
import { buildRuntimeVisualizerInputs } from "./runtime-visualizer-inputs";

type UseRuntimeVisualizersArgs = {
  surfaceKey?: string;
  enableHostInteractionTargets: boolean;
  points: readonly RuntimePointMarkerRenderModel[];
  linkedNodeGroups: readonly RuntimeNodeLink[];
  edges: readonly RuntimeEdgeRenderModel[];
  polygonFills: readonly RuntimePolygonFillRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
  selectedAnnotationIds: readonly string[];
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>;
  activeMoveGizmoNodeId: string | null;
  isMoveGizmoDragging: boolean;
  blockLabelInteractions: boolean;
  previewSnapTargetHoverEnabled?: boolean;
  onPreviewSnapTargetNodeClick?: (nodeId: string) => boolean;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
  onReferenceNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeHover?: (nodeId: string, hovered: boolean) => void;
  onReferenceEdgeClick?: (startNodeId: string, endNodeId: string) => boolean;
  onDistanceTriangleCornerClick?: (measurementId: string) => void;
};

export const useRuntimeVisualizers = (
  scene: RuntimeScene | null,
  {
    surfaceKey = "committed",
    enableHostInteractionTargets,
    points,
    linkedNodeGroups,
    edges,
    polygonFills,
    pointLabels,
    selectedAnnotationIds,
    formatOptions,
    previewLineLabelVisualOptions,
    activeMoveGizmoNodeId,
    isMoveGizmoDragging,
    blockLabelInteractions,
    previewSnapTargetHoverEnabled = false,
    onPreviewSnapTargetNodeClick,
    onMeasurementSelect,
    onNodeLongPress,
    onReferenceNodeClick,
    onReferenceNodeHover,
    onReferenceEdgeClick,
    onDistanceTriangleCornerClick,
  }: UseRuntimeVisualizersArgs
) => {
  const resolvedPreviewLineLabelVisualOptions = useMemo(
    () => resolvePreviewLineLabelVisualOptions(previewLineLabelVisualOptions),
    [previewLineLabelVisualOptions]
  );
  const previewSnapTargetsEnabled = Boolean(
    previewSnapTargetHoverEnabled && onPreviewSnapTargetNodeClick
  );
  const interactionBlocked =
    blockLabelInteractions || !enableHostInteractionTargets;

  useRuntimeMeasurementEdgesController(scene, {
    edges,
    formatOptions,
    previewLineLabelVisualOptions: resolvedPreviewLineLabelVisualOptions,
    surfaceKey,
    activeMoveGizmoNodeId: enableHostInteractionTargets
      ? activeMoveGizmoNodeId
      : null,
    blockEdgeInteractions: interactionBlocked,
    onMeasurementSelect,
    onEdgeClick: onReferenceEdgeClick,
    onDistanceTriangleCornerClick,
  });
  useRuntimeMeasurementPolygonFillsController(scene, polygonFills);

  const selectedAnnotationIdSet = useMemo(
    () => new Set(selectedAnnotationIds),
    [selectedAnnotationIds]
  );
  const nodeLinkIdByNodeId = useMemo(
    () => buildNodeLinkIdByNodeId(linkedNodeGroups),
    [linkedNodeGroups]
  );
  const previewNodeLinkId = useMemo(
    () =>
      activeMoveGizmoNodeId
        ? nodeLinkIdByNodeId.get(activeMoveGizmoNodeId) ?? activeMoveGizmoNodeId
        : null,
    [activeMoveGizmoNodeId, nodeLinkIdByNodeId]
  );
  const isInPreviewNodeLink = useCallback(
    (nodeId?: string) =>
      previewNodeLinkId !== null &&
      typeof nodeId === "string" &&
      (nodeLinkIdByNodeId.get(nodeId) ?? nodeId) === previewNodeLinkId,
    [nodeLinkIdByNodeId, previewNodeLinkId]
  );
  const nodeInteractionHoverEnabled =
    enableHostInteractionTargets &&
    Boolean(onReferenceNodeHover) &&
    ((activeMoveGizmoNodeId !== null && !isMoveGizmoDragging) ||
      previewSnapTargetsEnabled);
  const hasNodeInteractionHandlers = Boolean(
    onMeasurementSelect ||
      onNodeLongPress ||
      onReferenceNodeClick ||
      onReferenceNodeHover ||
      onPreviewSnapTargetNodeClick
  );
  const showNodeInteractionTargets =
    enableHostInteractionTargets &&
    hasNodeInteractionHandlers &&
    (nodeInteractionHoverEnabled || !blockLabelInteractions);
  const visualizerInputs = useMemo(
    () =>
      buildRuntimeVisualizerInputs({
        points,
        pointLabels,
        selectedAnnotationIdSet,
        showNodeInteractionTargets,
        nodeInteractionHoverEnabled,
        previewSnapTargetsEnabled,
        blockLabelInteractions,
        activeMoveGizmoNodeId,
        isMoveGizmoDragging,
        nodeLinkIdByNodeId,
        previewNodeLinkId,
        isInPreviewNodeLink,
        onMeasurementSelect,
        onNodeLongPress,
        onPreviewSnapTargetNodeClick,
        onReferenceNodeClick,
        onReferenceNodeHover,
        enableHostInteractionTargets,
      }),
    [
      activeMoveGizmoNodeId,
      blockLabelInteractions,
      enableHostInteractionTargets,
      isInPreviewNodeLink,
      isMoveGizmoDragging,
      nodeInteractionHoverEnabled,
      nodeLinkIdByNodeId,
      onMeasurementSelect,
      onNodeLongPress,
      onPreviewSnapTargetNodeClick,
      onReferenceNodeClick,
      onReferenceNodeHover,
      pointLabels,
      points,
      previewNodeLinkId,
      previewSnapTargetsEnabled,
      selectedAnnotationIdSet,
      showNodeInteractionTargets,
    ]
  );

  usePointMarkerVisualizer(
    scene,
    visualizerInputs.visibleStandalonePoints,
    `${surfaceKey}-runtime-point-marker`
  );

  usePointLabelVisualizer(
    scene,
    visualizerInputs.pointLabels,
    interactionBlocked,
    isInPreviewNodeLink,
    `${surfaceKey}-runtime-point-label`
  );
};
