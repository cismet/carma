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
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>;
  activeMoveGizmoNodeId: string | null;
  blockLabelInteractions: boolean;
  onNodeLongPress: (nodeId: string, measurementId: string) => void;
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

  const normalizedPointLabels = useMemo(
    () =>
      pointLabels.map((pointLabel) => ({
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
      pointLabels,
    ]
  );

  const pointMarkerIdsHandledByLabels = useMemo(
    () =>
      new Set(
        normalizedPointLabels.flatMap((pointLabel) =>
          pointLabel.pointMarkerId &&
          pointLabel.hideLabelAndStem !== true &&
          pointLabel.hideMarker !== true
            ? [pointLabel.pointMarkerId]
            : []
        )
      ),
    [normalizedPointLabels]
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
    labels: normalizedPointLabels,
    blockLabelInteractions,
  });
};
