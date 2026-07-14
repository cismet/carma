import type { Scene } from "@carma-cesium";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import type { AnnotationNodeLink } from "../store";
import { useAnnotationVisualizers } from "./use-annotation-visualizers";
import type { RuntimeVisualModels } from "./visual-models";
import type { LiveAnnotationAnchors } from "../interaction/live-annotation-anchors";

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
  liveAnchors: LiveAnnotationAnchors;
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
  liveAnchors,
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
    liveAnchors,
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

  // While a node is edited, its measurement carries a draft override and so
  // renders on THIS overlay surface instead of the committed one. The reference
  // nodes (the other endpoints) must stay clickable here so their height can be
  // adopted — otherwise the click falls through to the scene and exits edit
  // mode. Enable host interaction targets on the overlay only during edit and
  // wire just the reference-node handlers (the edited node is in the preview
  // link, so it stays non-interactive).
  const isNodeEditActive = activeEditedNodeId !== null;
  useAnnotationVisualizers(scene, {
    surfaceKey: "preview",
    enableHostInteractionTargets: isNodeEditActive,
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
    liveAnchors,
    onNodeLongPress: isNodeEditActive ? onNodeLongPress : undefined,
    canStartNodeEditing: isNodeEditActive ? canStartNodeEditing : undefined,
    onReferenceNodeClick: isNodeEditActive ? onReferenceNodeClick : undefined,
    onReferenceNodeHover: isNodeEditActive ? onReferenceNodeHover : undefined,
  });

  return null;
};
