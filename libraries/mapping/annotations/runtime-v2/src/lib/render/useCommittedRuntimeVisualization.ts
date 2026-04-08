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

const NODE_LABEL_LONG_PRESS_DURATION_MS = 320;

type UseCommittedRuntimeVisualizationArgs = {
  scene: RuntimeScene | null;
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  polygonFills: readonly RuntimePolygonFillRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
  blockLabelInteractions: boolean;
  onNodeLongPress: (nodeId: string, measurementId: string) => void;
};

export const useCommittedRuntimeVisualization = ({
  scene,
  points,
  edges,
  polygonFills,
  pointLabels,
  blockLabelInteractions,
  onNodeLongPress,
}: UseCommittedRuntimeVisualizationArgs) => {
  useRuntimeMeasurementEdgesController({
    scene,
    edges,
  });
  useRuntimeMeasurementPolygonFillsController({
    scene,
    polygonFills,
  });

  useRuntimePointMarkerVisualizer({
    scene,
    points,
  });

  const normalizedPointLabels = useMemo(
    () =>
      pointLabels.map((pointLabel) => ({
        ...pointLabel,
        onLongPress:
          pointLabel.onLongPress ??
          (pointLabel.nodeId && pointLabel.measurementId
            ? () =>
                onNodeLongPress(pointLabel.nodeId!, pointLabel.measurementId!)
            : undefined),
        longPressDurationMs:
          pointLabel.longPressDurationMs ?? NODE_LABEL_LONG_PRESS_DURATION_MS,
      })),
    [onNodeLongPress, pointLabels]
  );

  useRuntimePointLabelVisualizer({
    scene,
    labels: normalizedPointLabels,
    blockLabelInteractions,
  });
};
