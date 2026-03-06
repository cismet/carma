import { type Scene } from "@carma/cesium";

import { type AnnotationCollection } from "../types/AnnotationTypes";
import { type CesiumPointVisualizerOptions } from "./useCesiumPointVisualizer";
import { usePointMeasureVisualizer } from "./usePointMeasureVisualizer";

export type PointMeasureDomVisualizerHookOptions = Omit<
  CesiumPointVisualizerOptions,
  "renderDomVisuals" | "renderCesiumCoreVisuals"
> & {
  scene: Scene | null;
  measurements?: AnnotationCollection;
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
