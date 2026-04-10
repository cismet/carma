import { useCallback, useMemo } from "react";

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
import type { RuntimeLinkedNodeGroup, RuntimeNode } from "../store";
import { buildLinkedNodeGroupIdByNodeId } from "../store";
import {
  resolvePreviewLineLabelVisualOptions,
  type PreviewLineLabelVisualOptions,
} from "../config/previewLineLabelVisualDefaults";

const NODE_LABEL_LONG_PRESS_DURATION_MS = 320;

type UseCommittedRuntimeVisualizationArgs = {
  scene: RuntimeScene | null;
  points: readonly RuntimePointMarkerRenderModel[];
  nodes: readonly RuntimeNode[];
  linkedNodeGroups: readonly RuntimeLinkedNodeGroup[];
  edges: readonly RuntimeEdgeRenderModel[];
  polygonFills: readonly RuntimePolygonFillRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
  selectedAnnotationIds: readonly string[];
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>;
  activeMoveGizmoNodeId: string | null;
  blockLabelInteractions: boolean;
  onMeasurementSelect: (measurementId: string) => void;
  onNodeLongPress: (nodeId: string, measurementId?: string) => void;
  onReferenceNodeClick: (nodeId: string) => boolean;
  onReferenceEdgeClick: (startNodeId: string, endNodeId: string) => boolean;
  onDistanceTriangleCornerClick: (measurementId: string) => void;
};

export const useCommittedRuntimeVisualization = ({
  scene,
  points,
  nodes: _nodes,
  linkedNodeGroups,
  edges,
  polygonFills,
  pointLabels,
  selectedAnnotationIds,
  formatOptions,
  previewLineLabelVisualOptions,
  activeMoveGizmoNodeId,
  blockLabelInteractions,
  onMeasurementSelect,
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
    blockEdgeInteractions: blockLabelInteractions,
    onMeasurementSelect,
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
  const linkedNodeGroupIdByNodeId = useMemo(
    () => buildLinkedNodeGroupIdByNodeId(linkedNodeGroups),
    [linkedNodeGroups]
  );
  const showNodeInteractionTargets =
    activeMoveGizmoNodeId !== null || !blockLabelInteractions;
  const isMeasurementSelected = useCallback(
    (measurementId?: string) =>
      measurementId !== undefined && selectedAnnotationIdSet.has(measurementId),
    [selectedAnnotationIdSet]
  );

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
          blockLabelInteractions
            ? undefined
            : pointLabel.onLongPress ??
              (pointLabel.nodeId && pointLabel.measurementId
                ? () =>
                    onNodeLongPress(
                      pointLabel.nodeId!,
                      pointLabel.measurementId!
                    )
                : undefined),
        longPressDurationMs:
          pointLabel.longPressDurationMs ?? NODE_LABEL_LONG_PRESS_DURATION_MS,
      })),
    [
      activeMoveGizmoNodeId,
      blockLabelInteractions,
      onNodeLongPress,
      onReferenceNodeClick,
      visiblePointLabels,
    ]
  );

  const nodeInteractionPointLabels = useMemo(() => {
    if (!showNodeInteractionTargets) {
      return [];
    }

    const nodeInteractionLabelsByGroupId = new Map<
      string,
      RuntimePointLabelRenderModel
    >();

    points.forEach((point) => {
      if (!point.nodeId) {
        return;
      }

      const linkedNodeGroupId =
        linkedNodeGroupIdByNodeId.get(point.nodeId) ?? point.nodeId;
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
            : point.measurementId
            ? () => {
                onMeasurementSelect(point.measurementId!);
              }
            : undefined,
        onLongPress: blockLabelInteractions
          ? undefined
          : () => onNodeLongPress(point.nodeId!, point.measurementId),
        longPressDurationMs: NODE_LABEL_LONG_PRESS_DURATION_MS,
      };

      const existingNodeInteractionLabel =
        nodeInteractionLabelsByGroupId.get(linkedNodeGroupId) ?? null;
      if (!existingNodeInteractionLabel) {
        nodeInteractionLabelsByGroupId.set(
          linkedNodeGroupId,
          nodeInteractionLabel
        );
        return;
      }

      const existingIsSelected = isMeasurementSelected(
        existingNodeInteractionLabel.measurementId
      );
      const nextIsSelected = isMeasurementSelected(point.measurementId);

      if (!existingIsSelected && nextIsSelected) {
        nodeInteractionLabelsByGroupId.set(
          linkedNodeGroupId,
          nodeInteractionLabel
        );
      }
    });

    return [...nodeInteractionLabelsByGroupId.values()];
  }, [
    activeMoveGizmoNodeId,
    isMeasurementSelected,
    linkedNodeGroupIdByNodeId,
    onMeasurementSelect,
    onNodeLongPress,
    onReferenceNodeClick,
    points,
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
