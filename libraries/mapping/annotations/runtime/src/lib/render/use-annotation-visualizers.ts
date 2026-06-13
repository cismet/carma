import { useCallback, useMemo } from "react";

import { usePointMarkerVisualizer } from "./point-marker-visualizer";
import { usePointLabelVisualizer } from "./point-label-visualizer";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillRenderModel,
} from "./annotation-render-models";
import { useAnnotationEdgesController } from "./use-annotation-edges-controller";
import { useAnnotationOverlayPolygonFillsController } from "./use-annotation-overlay-polygon-fills-controller";
import { useAnnotationPolygonFillsController } from "./use-annotation-polygon-fills-controller";
import type { Scene } from "@carma-cesium";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { AnnotationNodeLink } from "../store";
import { buildNodeLinkIdByNodeId } from "../store";
import {
  resolveAnnotationLineLabelOptions,
  type PartialAnnotationLineLabelOptions,
  type AnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import { buildVisualizerInputs } from "./visualizer-inputs";

type UseAnnotationVisualizersArgs = {
  surfaceKey?: string;
  enableHostInteractionTargets: boolean;
  points: readonly RuntimePointMarkerRenderModel[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  edges: readonly RuntimeEdgeRenderModel[];
  polygonFills: readonly RuntimePolygonFillRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
  selectedAnnotationIds: readonly string[];
  formatOptions: AnnotationsRuntimeFormatOptions;
  lineLabelOptions?: PartialAnnotationLineLabelOptions;
  activeEditedNodeId: string | null;
  isMoveGizmoDragging?: boolean;
  previewSnapTargetHoverEnabled?: boolean;
  onPreviewSnapTargetNodeClick?: (nodeId: string) => boolean;
  onAnnotationSelect?: (annotationId: string) => void;
  onNodeAnnotationsSelect?: (annotationIds: readonly string[]) => void;
  onNodeLongPress?: (nodeId: string, annotationId?: string) => void;
  canStartNodeEditing?: (nodeId: string, annotationId?: string) => boolean;
  onReferenceNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeHover?: (nodeId: string, hovered: boolean) => void;
  onReferenceEdgeClick?: (startNodeId: string, endNodeId: string) => boolean;
  insertNodeTargetAnnotationIds?: readonly string[];
  onInsertNodeTargetClick?: (
    annotationId: string,
    startNodeId: string,
    endNodeId: string
  ) => boolean;
  onDistanceTriangleCornerClick?: (annotationId: string) => void;
};

export const useAnnotationVisualizers = (
  scene: Scene | null,
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
    lineLabelOptions,
    activeEditedNodeId,
    isMoveGizmoDragging = false,
    previewSnapTargetHoverEnabled = false,
    onPreviewSnapTargetNodeClick,
    onAnnotationSelect,
    onNodeAnnotationsSelect,
    onNodeLongPress,
    canStartNodeEditing,
    onReferenceNodeClick,
    onReferenceNodeHover,
    onReferenceEdgeClick,
    insertNodeTargetAnnotationIds = [],
    onInsertNodeTargetClick,
    onDistanceTriangleCornerClick,
  }: UseAnnotationVisualizersArgs
) => {
  const resolvedAnnotationLineLabelOptions = useMemo(
    () => resolveAnnotationLineLabelOptions(lineLabelOptions),
    [lineLabelOptions]
  );
  const previewSnapTargetsEnabled = Boolean(
    previewSnapTargetHoverEnabled && onPreviewSnapTargetNodeClick
  );
  const blockEdgeInteractions =
    !enableHostInteractionTargets ||
    previewSnapTargetsEnabled ||
    activeEditedNodeId !== null;

  useAnnotationEdgesController(scene, {
    edges,
    formatOptions,
    lineLabelOptions: resolvedAnnotationLineLabelOptions,
    surfaceKey,
    activeEditedNodeId: enableHostInteractionTargets
      ? activeEditedNodeId
      : null,
    blockEdgeInteractions,
    onAnnotationSelect,
    onEdgeClick: onReferenceEdgeClick,
    insertNodeTargetAnnotationIds,
    onInsertNodeTargetClick,
    onDistanceTriangleCornerClick,
  });
  useAnnotationPolygonFillsController(scene, polygonFills);
  useAnnotationOverlayPolygonFillsController(scene, polygonFills, surfaceKey);

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
      activeEditedNodeId
        ? nodeLinkIdByNodeId.get(activeEditedNodeId) ?? activeEditedNodeId
        : null,
    [activeEditedNodeId, nodeLinkIdByNodeId]
  );
  const isInPreviewNodeLink = useCallback(
    (nodeId?: string) =>
      previewNodeLinkId !== null &&
      typeof nodeId === "string" &&
      (nodeLinkIdByNodeId.get(nodeId) ?? nodeId) === previewNodeLinkId,
    [nodeLinkIdByNodeId, previewNodeLinkId]
  );
  const referenceNodeInteractionsEnabled =
    activeEditedNodeId !== null && !isMoveGizmoDragging;
  const referenceNodeClickEnabled = Boolean(
    referenceNodeInteractionsEnabled && onReferenceNodeClick
  );
  const referenceNodeHoverEnabled = Boolean(
    referenceNodeInteractionsEnabled && onReferenceNodeHover
  );
  const visualizerInputs = useMemo(
    () =>
      buildVisualizerInputs({
        points,
        pointLabels,
        selectedAnnotationIdSet,
        previewSnapTargetsEnabled,
        referenceNodeClickEnabled,
        referenceNodeHoverEnabled,
        nodeLinkIdByNodeId,
        previewNodeLinkId,
        isInPreviewNodeLink,
        onAnnotationSelect,
        onNodeAnnotationsSelect,
        onNodeLongPress,
        canStartNodeEditing,
        onPreviewSnapTargetNodeClick,
        onReferenceNodeClick,
        onReferenceNodeHover,
        enableHostInteractionTargets,
      }),
    [
      enableHostInteractionTargets,
      isInPreviewNodeLink,
      nodeLinkIdByNodeId,
      onAnnotationSelect,
      onNodeAnnotationsSelect,
      onNodeLongPress,
      canStartNodeEditing,
      onPreviewSnapTargetNodeClick,
      onReferenceNodeClick,
      onReferenceNodeHover,
      pointLabels,
      points,
      previewNodeLinkId,
      previewSnapTargetsEnabled,
      referenceNodeClickEnabled,
      referenceNodeHoverEnabled,
      selectedAnnotationIdSet,
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
    isInPreviewNodeLink,
    `${surfaceKey}-runtime-point-label`,
    resolvedAnnotationLineLabelOptions
  );
};
