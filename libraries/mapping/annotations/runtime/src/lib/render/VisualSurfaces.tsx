import type { Scene } from "@carma-cesium";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
import type { AnnotationNodeLink } from "../store";
import { useMeasurementVisualizers } from "./use-measurement-visualizers";
import type { RuntimeVisualModels } from "./visual-models";

type VisualSurfacesProps = {
  scene: Scene | null;
  baseVisualModels: RuntimeVisualModels;
  overlayVisualModels: RuntimeVisualModels | null;
  linkedNodeGroups: readonly AnnotationNodeLink[];
  effectiveLinkedNodeGroups: readonly AnnotationNodeLink[];
  selectedAnnotationIds: readonly string[];
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions: Partial<PreviewLineLabelVisualOptions>;
  activeMoveGizmoNodeId: string | null;
  isMoveGizmoDragging: boolean;
  isMeasurementToolActive: boolean;
  previewSnapTargetHoverEnabled: boolean;
  onPreviewSnapTargetNodeClick: (nodeId: string) => boolean;
  onMeasurementSelect: (annotationId: string | null) => void;
  onNodeLongPress: (nodeId: string, measurementId?: string) => void;
  onReferenceNodeClick: (nodeId: string) => boolean;
  onReferenceNodeHover: (nodeId: string, hovered: boolean) => void;
  onPreviewNodeHover: (nodeId: string, hovered: boolean) => void;
  onReferenceEdgeClick: (startNodeId: string, endNodeId: string) => boolean;
  insertNodeTargetMeasurementIds: readonly string[];
  onInsertNodeTargetClick: (
    measurementId: string,
    startNodeId: string,
    endNodeId: string
  ) => boolean;
  onDistanceTriangleCornerClick: (measurementId: string) => void;
};

export const VisualSurfaces = ({
  scene,
  baseVisualModels,
  overlayVisualModels,
  linkedNodeGroups,
  effectiveLinkedNodeGroups,
  selectedAnnotationIds,
  formatOptions,
  previewLineLabelVisualOptions,
  activeMoveGizmoNodeId,
  isMoveGizmoDragging,
  isMeasurementToolActive,
  previewSnapTargetHoverEnabled,
  onPreviewSnapTargetNodeClick,
  onMeasurementSelect,
  onNodeLongPress,
  onReferenceNodeClick,
  onReferenceNodeHover,
  onPreviewNodeHover,
  onReferenceEdgeClick,
  insertNodeTargetMeasurementIds,
  onInsertNodeTargetClick,
  onDistanceTriangleCornerClick,
}: VisualSurfacesProps) => {
  useMeasurementVisualizers(scene, {
    surfaceKey: "committed",
    enableHostInteractionTargets: true,
    points: baseVisualModels.points ?? [],
    linkedNodeGroups,
    edges: baseVisualModels.edges ?? [],
    polygonFills: baseVisualModels.polygonFills ?? [],
    pointLabels: baseVisualModels.pointLabels ?? [],
    selectedAnnotationIds,
    formatOptions,
    previewLineLabelVisualOptions,
    activeMoveGizmoNodeId,
    isMoveGizmoDragging,
    blockLabelInteractions:
      activeMoveGizmoNodeId !== null || isMeasurementToolActive,
    previewSnapTargetHoverEnabled,
    onPreviewSnapTargetNodeClick,
    onMeasurementSelect,
    onNodeLongPress,
    onReferenceNodeClick,
    onReferenceNodeHover:
      activeMoveGizmoNodeId !== null
        ? onReferenceNodeHover
        : onPreviewNodeHover,
    onReferenceEdgeClick,
    insertNodeTargetMeasurementIds,
    onInsertNodeTargetClick,
    onDistanceTriangleCornerClick,
  });

  useMeasurementVisualizers(scene, {
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

  return null;
};
