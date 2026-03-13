import { useMemo } from "react";

import { projectGeographicCoordinateToScreen } from "@carma-mapping/annotations/cesium";
import {
  usePointLabels,
  type PointLabelData,
} from "@carma-providers/label-overlay";

import type { RuntimePointMarkerRenderModel } from "./measurementRenderModels";
import type { RuntimeScene } from "../types/runtimeScene.types";

type RuntimePointMarkerVisualizerProps = {
  scene: RuntimeScene | null;
  points: readonly RuntimePointMarkerRenderModel[];
};

export const RuntimePointMarkerVisualizer = ({
  scene,
  points,
}: RuntimePointMarkerVisualizerProps) => {
  const markerLabels = useMemo<readonly PointLabelData[]>(
    () =>
      points.map((point) => ({
        id: `runtime-point-marker-${point.id}`,
        content: "",
        hideLabelAndStem: true,
        hideMarker: false,
        markerSize: point.pixelSize,
        markerStrokeWidth: point.outlineWidth,
        markerBackgroundColor: point.fill,
        markerTextColor: "transparent",
        visible: true,
        attachOverlayClickHandlers: false,
        markerOnlyPointerEvents: false,
        forceMarkerInteractionTarget: false,
        getCanvasPosition: () =>
          projectGeographicCoordinateToScreen(scene, point.coordinate),
      })),
    [points, scene]
  );

  usePointLabels([...markerLabels], true);

  return null;
};
