import { type Scene } from "@carma/cesium";

import { type PointAnnotationEntry } from "../types/AnnotationTypes";
import { type CesiumDistanceVisualizerOptions } from "./useCesiumDistanceVisualizer";
import { useDistanceVisualizer } from "./useDistanceVisualizer";

export type DistanceDomVisualizerHookOptions = Omit<
  CesiumDistanceVisualizerOptions,
  "renderDomVisuals" | "renderCesiumCoreVisuals"
> & {
  scene: Scene | null;
  points: PointAnnotationEntry[];
};

export const useDistanceDomVisualizer = ({
  scene,
  points,
  ...options
}: DistanceDomVisualizerHookOptions) => {
  useDistanceVisualizer({
    ...options,
    scene,
    points,
    renderDomVisuals: true,
    renderCesiumCoreVisuals: false,
  });
};

export default useDistanceDomVisualizer;
