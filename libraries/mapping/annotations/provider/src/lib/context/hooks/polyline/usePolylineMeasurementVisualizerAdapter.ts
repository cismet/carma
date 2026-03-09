import { type Scene } from "@carma/cesium";
import type { PolylinePreviewMeasurement } from "@carma-mapping/annotations/core";

import { usePolylineOverlayVisualizer } from "./usePolylineOverlayVisualizer";

export type PolylineMeasurementVisualizerAdapterOptions = {
  scene: Scene | null;
  measurements: readonly PolylinePreviewMeasurement[];
  enabled?: boolean;
};

export const usePolylineMeasurementVisualizerAdapter = ({
  scene,
  measurements,
  enabled = true,
}: PolylineMeasurementVisualizerAdapterOptions) => {
  const visibleMeasurements = enabled ? [...measurements] : [];

  usePolylineOverlayVisualizer({
    scene,
    polylineMeasurements: visibleMeasurements,
  });
};
