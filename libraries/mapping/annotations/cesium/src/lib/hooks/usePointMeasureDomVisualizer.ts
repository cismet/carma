import { type Scene } from "@carma/cesium";

import { type MeasurementCollection } from "../types/MeasurementTypes";
import { type CesiumPointVisualizerOptions } from "./useCesiumPointVisualizer";
import { usePointMeasureVisualizer } from "./usePointMeasureVisualizer";

export type PointMeasureDomVisualizerHookOptions = Omit<
  CesiumPointVisualizerOptions,
  "renderDomVisuals" | "renderCesiumCoreVisuals"
> & {
  scene: Scene | null;
  measurements?: MeasurementCollection;
};

export const usePointMeasureDomVisualizer = ({
  scene,
  measurements = [],
  ...options
}: PointMeasureDomVisualizerHookOptions) => {
  usePointMeasureVisualizer({
    ...options,
    scene,
    measurements,
    renderDomVisuals: true,
    renderCesiumCoreVisuals: false,
  });
};

export default usePointMeasureDomVisualizer;
