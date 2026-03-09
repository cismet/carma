import { type Scene } from "@carma/cesium";
import { type PointAnnotationEntry } from "@carma-mapping/annotations/core";

import {
  useCesiumDistanceVisualizer,
  type CesiumDistanceVisualizerOptions,
} from "@carma-mapping/annotations/cesium";

export type DistanceVisualizerHookOptions = CesiumDistanceVisualizerOptions & {
  scene: Scene | null;
  points: PointAnnotationEntry[];
};

export const useDistanceVisualizer = ({
  scene,
  points,
  ...options
}: DistanceVisualizerHookOptions) => {
  const {
    renderDomVisuals = true,
    renderCesiumCoreVisuals = true,
    ...distanceOptions
  } = options;
  useCesiumDistanceVisualizer(scene, points, {
    ...distanceOptions,
    renderDomVisuals,
    renderCesiumCoreVisuals,
  });
};

export default useDistanceVisualizer;
