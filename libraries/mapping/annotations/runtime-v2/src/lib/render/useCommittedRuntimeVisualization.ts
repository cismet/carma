import { useMemo } from "react";

import { useRuntimePointMarkerVisualizer } from "./RuntimePointMarkerVisualizer";
import { useRuntimePointLabelVisualizer } from "./RuntimePointLabelVisualizer";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillRenderModel,
} from "./measurementRenderModels";
import { useRuntimeMeasurementEdgesController } from "./useRuntimeMeasurementEdgesController";
import { useRuntimeMeasurementPolygonFillsController } from "./useRuntimeMeasurementPolygonFillsController";
import type { RuntimeScene } from "../types/runtimeScene.types";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotationsRuntimeFormatOptions";
import {
  resolvePreviewLineLabelVisualOptions,
  type PreviewLineLabelVisualOptions,
} from "../config/previewLineLabelVisualDefaults";

const NODE_LABEL_LONG_PRESS_DURATION_MS = 320;

type UseCommittedRuntimeVisualizationArgs = {
  scene: RuntimeScene | null;
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  polygonFills: readonly RuntimePolygonFillRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
  selectedAnnotationIds: readonly string[];
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>;
  activeMoveGizmoNodeId: string | null;
  blockLabelInteractions: boolean;
  onNodeLongPress: (nodeId: string, measurementId?: string) => void;
  onReferenceNodeClick: (nodeId: string) => boolean;
  onReferenceEdgeClick: (startNodeId: string, endNodeId: string) => boolean;
  onDistanceTriangleCornerClick: (measurementId: string) => void;
};

export const useCommittedRuntimeVisualization = ({
  scene,
  points,
  edges,
  polygonFills,
  pointLabels,
  selectedAnnotationIds,
  formatOptions,
  previewLineLabelVisualOptions,
  activeMoveGizmoNodeId,
  blockLabelInteractions,
  onNodeLongPress,
  onReferenceNodeClick,
  onReferenceEdgeClick,
  onDistanceTriangleCornerClick,
}: UseCommittedRuntimeVisualizationArgs) => {
  const resolvedPreviewLineLabelVisualOptions = useMemo(
    () => resolvePreviewLineLabelVisualOptions(previewLineLabelVisualOptions),
    [previewLineLabelVisualOptions]
  );

  useRuntimeMeasurementEdgesController({
    scene,
    edges,
    formatOptions,
    previewLineLabelVisualOptions: resolvedPreviewLineLabelVisualOptions,
    activeMoveGizmoNodeId,
    onEdgeClick: onReferenceEdgeClick,
    onDistanceTriangleCornerClick,
  });
  useRuntimeMeasurementPolygonFillsController({
    scene,
    polygonFills,
  });

  const selectedAnnotationIdSet = useMemo(
    () => new Set(selectedAnnotationIds),
    [selectedAnnotationIds]
  );
  const showNodeInteractionTargets =
    activeMoveGizmoNodeId !== null || !blockLabelInteractions;

  const visiblePointLabels = useMemo(
    () =>
      pointLabels.filter(
        (pointLabel) =>
          !(
            pointLabel.hideLabelAndStem === true &&
            pointLabel.nodeId !== undefined
          )
      ),
    [pointLabels]
  );

  const normalizedPointLabels = useMemo(
    () =>
      visiblePointLabels.map((pointLabel) => ({
        ...pointLabel,
        onClick:
          pointLabel.onClick || (activeMoveGizmoNodeId && pointLabel.nodeId)
            ? () => {
                if (
                  activeMoveGizmoNodeId &&
                  pointLabel.nodeId &&
                  onReferenceNodeClick(pointLabel.nodeId)
                ) {
                  return;
                }

                pointLabel.onClick?.();
              }
            : undefined,
        allowClickWhenBlocked:
          pointLabel.allowClickWhenBlocked ||
          Boolean(activeMoveGizmoNodeId && pointLabel.nodeId),
        onLongPress:
          pointLabel.onLongPress ??
          (pointLabel.nodeId && pointLabel.measurementId
            ? () =>
                onNodeLongPress(pointLabel.nodeId!, pointLabel.measurementId!)
            : undefined),
        longPressDurationMs:
          pointLabel.longPressDurationMs ?? NODE_LABEL_LONG_PRESS_DURATION_MS,
      })),
    [
      activeMoveGizmoNodeId,
      onNodeLongPress,
      onReferenceNodeClick,
      visiblePointLabels,
    ]
  );

  const nodeInteractionPointLabels = useMemo(() => {
    if (!showNodeInteractionTargets) {
      return [];
    }

    const unselectedNodeLabels: RuntimePointLabelRenderModel[] = [];
    const selectedNodeLabels: RuntimePointLabelRenderModel[] = [];

    points.forEach((point) => {
      if (!point.nodeId) {
        return;
      }

      const nodeInteractionLabel: RuntimePointLabelRenderModel = {
        id: `${point.id}-node-interaction`,
        measurementId: point.measurementId,
        nodeId: point.nodeId,
        pointMarkerId: point.id,
        coordinate: point.coordinate,
        markerPixelSize: point.pixelSize,
        content: "",
        hideLabelAndStem: true,
        hideMarker: true,
        markerOnlyPointerEvents: true,
        allowClickWhenBlocked: Boolean(activeMoveGizmoNodeId),
        allowLongPressWhenBlocked: true,
        onClick:
          activeMoveGizmoNodeId && point.nodeId
            ? () => {
                onReferenceNodeClick(point.nodeId!);
              }
            : undefined,
        onLongPress: () => onNodeLongPress(point.nodeId!, point.measurementId),
        longPressDurationMs: NODE_LABEL_LONG_PRESS_DURATION_MS,
      };

      if (
        point.measurementId &&
        selectedAnnotationIdSet.has(point.measurementId)
      ) {
        selectedNodeLabels.push(nodeInteractionLabel);
        return;
      }

      unselectedNodeLabels.push(nodeInteractionLabel);
    });

    return [...unselectedNodeLabels, ...selectedNodeLabels];
  }, [
    activeMoveGizmoNodeId,
    onNodeLongPress,
    onReferenceNodeClick,
    points,
    selectedAnnotationIdSet,
    showNodeInteractionTargets,
  ]);

  const allPointLabels = useMemo(
    () => [...normalizedPointLabels, ...nodeInteractionPointLabels],
    [nodeInteractionPointLabels, normalizedPointLabels]
  );

  const pointMarkerIdsHandledByLabels = useMemo(
    () =>
      new Set(
        allPointLabels.flatMap((pointLabel) =>
          pointLabel.pointMarkerId &&
          pointLabel.hideLabelAndStem !== true &&
          pointLabel.hideMarker !== true
            ? [pointLabel.pointMarkerId]
            : []
        )
      ),
    [allPointLabels]
  );

  const normalizedPoints = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        onClick:
          activeMoveGizmoNodeId && point.nodeId
            ? () => {
                onReferenceNodeClick(point.nodeId!);
              }
            : undefined,
      })),
    [activeMoveGizmoNodeId, onReferenceNodeClick, points]
  );

  const visibleStandalonePoints = useMemo(
    () =>
      normalizedPoints.filter(
        (point) => !pointMarkerIdsHandledByLabels.has(point.id)
      ),
    [normalizedPoints, pointMarkerIdsHandledByLabels]
  );

  useRuntimePointMarkerVisualizer({
    scene,
    points: visibleStandalonePoints,
  });

  useRuntimePointLabelVisualizer({
    scene,
    labels: allPointLabels,
    blockLabelInteractions,
  });
};
