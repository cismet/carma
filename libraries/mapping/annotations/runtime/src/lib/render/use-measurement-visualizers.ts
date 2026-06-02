import { useCallback, useMemo } from "react";

import { usePointMarkerVisualizer } from "./point-marker-visualizer";
import { usePointLabelVisualizer } from "./point-label-visualizer";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillRenderModel,
} from "./measurement-render-models";
import { useMeasurementEdgesController } from "./use-measurement-edges-controller";
import { useMeasurementOverlayPolygonFillsController } from "./use-measurement-overlay-polygon-fills-controller";
import { useMeasurementPolygonFillsController } from "./use-measurement-polygon-fills-controller";
import type { Scene } from "@carma-cesium";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { AnnotationNodeLink } from "../store";
import { buildNodeLinkIdByNodeId } from "../store";
import {
  resolveAnnotationLineLabelOptions,
  type PartialAnnotationLineLabelOptions,
  type AnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import { shouldShowNodeInteractionTargets } from "./node-interaction-targets";
import { buildVisualizerInputs } from "./visualizer-inputs";

type UseMeasurementVisualizersArgs = {
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
  activeMoveGizmoNodeId: string | null;
  isMoveGizmoDragging: boolean;
  blockLabelInteractions: boolean;
  previewSnapTargetHoverEnabled?: boolean;
  onPreviewSnapTargetNodeClick?: (nodeId: string) => boolean;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeMeasurementsSelect?: (measurementIds: readonly string[]) => void;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
  onReferenceNodeClick?: (nodeId: string) => boolean;
  onReferenceNodeHover?: (nodeId: string, hovered: boolean) => void;
  onReferenceEdgeClick?: (startNodeId: string, endNodeId: string) => boolean;
  insertNodeTargetMeasurementIds?: readonly string[];
  onInsertNodeTargetClick?: (
    measurementId: string,
    startNodeId: string,
    endNodeId: string
  ) => boolean;
  onDistanceTriangleCornerClick?: (measurementId: string) => void;
};

export const useMeasurementVisualizers = (
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
    activeMoveGizmoNodeId,
    isMoveGizmoDragging,
    blockLabelInteractions,
    previewSnapTargetHoverEnabled = false,
    onPreviewSnapTargetNodeClick,
    onMeasurementSelect,
    onNodeMeasurementsSelect,
    onNodeLongPress,
    onReferenceNodeClick,
    onReferenceNodeHover,
    onReferenceEdgeClick,
    insertNodeTargetMeasurementIds = [],
    onInsertNodeTargetClick,
    onDistanceTriangleCornerClick,
  }: UseMeasurementVisualizersArgs
) => {
  const resolvedAnnotationLineLabelOptions = useMemo(
    () => resolveAnnotationLineLabelOptions(lineLabelOptions),
    [lineLabelOptions]
  );
  const previewSnapTargetsEnabled = Boolean(
    previewSnapTargetHoverEnabled && onPreviewSnapTargetNodeClick
  );
  const interactionBlocked =
    blockLabelInteractions || !enableHostInteractionTargets;

  useMeasurementEdgesController(scene, {
    edges,
    formatOptions,
    lineLabelOptions: resolvedAnnotationLineLabelOptions,
    surfaceKey,
    activeMoveGizmoNodeId: enableHostInteractionTargets
      ? activeMoveGizmoNodeId
      : null,
    blockEdgeInteractions: interactionBlocked,
    onMeasurementSelect,
    onEdgeClick: onReferenceEdgeClick,
    insertNodeTargetMeasurementIds,
    onInsertNodeTargetClick,
    onDistanceTriangleCornerClick,
  });
  useMeasurementPolygonFillsController(scene, polygonFills);
  useMeasurementOverlayPolygonFillsController(scene, polygonFills, surfaceKey);

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
  const nodeLongPressInteractionEnabled = Boolean(onNodeLongPress);
  const showNodeInteractionTargets = shouldShowNodeInteractionTargets({
    enableHostInteractionTargets,
    hasNodeInteractionHandlers,
    nodeInteractionHoverEnabled,
    nodeLongPressInteractionEnabled,
    blockLabelInteractions,
  });
  const visualizerInputs = useMemo(
    () =>
      buildVisualizerInputs({
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
        onNodeMeasurementsSelect,
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
      onNodeMeasurementsSelect,
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
