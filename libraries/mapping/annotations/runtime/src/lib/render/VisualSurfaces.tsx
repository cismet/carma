import type { Scene } from "@carma-cesium";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
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
  lineLabelOptions: PartialAnnotationLineLabelOptions;
  activeEditedNodeId: string | null;
  isMoveGizmoDragging: boolean;
  isMeasurementToolActive: boolean;
  previewSnapTargetHoverEnabled: boolean;
  onPreviewSnapTargetNodeClick: (nodeId: string) => boolean;
  onMeasurementSelect: (annotationId: string | null) => void;
  onNodeMeasurementsSelect: (annotationIds: readonly string[]) => void;
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
  lineLabelOptions,
  activeEditedNodeId,
  isMoveGizmoDragging,
  isMeasurementToolActive,
  previewSnapTargetHoverEnabled,
  onPreviewSnapTargetNodeClick,
  onMeasurementSelect,
  onNodeMeasurementsSelect,
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
    lineLabelOptions,
    activeEditedNodeId,
    isMoveGizmoDragging,
    blockLabelInteractions:
      activeEditedNodeId !== null || isMeasurementToolActive,
    previewSnapTargetHoverEnabled,
    onPreviewSnapTargetNodeClick,
    onMeasurementSelect,
    onNodeMeasurementsSelect,
    onNodeLongPress,
    onReferenceNodeClick,
    onReferenceNodeHover:
      activeEditedNodeId !== null ? onReferenceNodeHover : onPreviewNodeHover,
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
    lineLabelOptions,
    activeEditedNodeId,
    isMoveGizmoDragging,
    blockLabelInteractions: true,
  });

  return null;
};
