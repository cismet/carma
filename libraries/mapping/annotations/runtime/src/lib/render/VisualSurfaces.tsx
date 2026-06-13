import type { Scene } from "@carma-cesium";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import type { AnnotationNodeLink } from "../store";
import { useAnnotationVisualizers } from "./use-annotation-visualizers";
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
  onAnnotationSelect: (annotationId: string | null) => void;
  onNodeAnnotationsSelect: (annotationIds: readonly string[]) => void;
  onNodeLongPress: (nodeId: string, annotationId?: string) => void;
  canStartNodeEditing: (nodeId: string, annotationId?: string) => boolean;
  onReferenceNodeClick: (nodeId: string) => boolean;
  onReferenceNodeHover: (nodeId: string, hovered: boolean) => void;
  onPreviewNodeHover: (nodeId: string, hovered: boolean) => void;
  onReferenceEdgeClick: (startNodeId: string, endNodeId: string) => boolean;
  insertNodeTargetAnnotationIds: readonly string[];
  onInsertNodeTargetClick: (
    annotationId: string,
    startNodeId: string,
    endNodeId: string
  ) => boolean;
  onDistanceTriangleCornerClick: (annotationId: string) => void;
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
  onAnnotationSelect,
  onNodeAnnotationsSelect,
  onNodeLongPress,
  canStartNodeEditing,
  onReferenceNodeClick,
  onReferenceNodeHover,
  onPreviewNodeHover,
  onReferenceEdgeClick,
  insertNodeTargetAnnotationIds,
  onInsertNodeTargetClick,
  onDistanceTriangleCornerClick,
}: VisualSurfacesProps) => {
  useAnnotationVisualizers(scene, {
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
    previewSnapTargetHoverEnabled,
    onPreviewSnapTargetNodeClick,
    onAnnotationSelect,
    onNodeAnnotationsSelect,
    onNodeLongPress,
    canStartNodeEditing,
    onReferenceNodeClick,
    onReferenceNodeHover:
      activeEditedNodeId !== null ? onReferenceNodeHover : onPreviewNodeHover,
    onReferenceEdgeClick,
    insertNodeTargetAnnotationIds,
    onInsertNodeTargetClick,
    onDistanceTriangleCornerClick,
  });

  useAnnotationVisualizers(scene, {
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
  });

  return null;
};
