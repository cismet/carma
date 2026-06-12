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
  activeEditedNodeId: string | null;
  isMoveGizmoDragging?: boolean;
  previewSnapTargetHoverEnabled?: boolean;
  onPreviewSnapTargetNodeClick?: (nodeId: string) => boolean;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeMeasurementsSelect?: (measurementIds: readonly string[]) => void;
  onNodeLongPress?: (nodeId: string, measurementId?: string) => void;
  canStartNodeEditing?: (nodeId: string, measurementId?: string) => boolean;
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
    activeEditedNodeId,
    isMoveGizmoDragging = false,
    previewSnapTargetHoverEnabled = false,
    onPreviewSnapTargetNodeClick,
    onMeasurementSelect,
    onNodeMeasurementsSelect,
    onNodeLongPress,
    canStartNodeEditing,
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
  const blockEdgeInteractions =
    !enableHostInteractionTargets ||
    previewSnapTargetsEnabled ||
    activeEditedNodeId !== null;

  useMeasurementEdgesController(scene, {
    edges,
    formatOptions,
    lineLabelOptions: resolvedAnnotationLineLabelOptions,
    surfaceKey,
    activeEditedNodeId: enableHostInteractionTargets
      ? activeEditedNodeId
      : null,
    blockEdgeInteractions,
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
        onMeasurementSelect,
        onNodeMeasurementsSelect,
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
      onMeasurementSelect,
      onNodeMeasurementsSelect,
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
