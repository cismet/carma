import { type Scene } from "@carma/cesium";

import { type PointAnnotationEntry } from "../types/AnnotationTypes";
import {
  useCesiumDistanceVisualizer,
  type CesiumDistanceVisualizerOptions,
} from "./useCesiumDistanceVisualizer";

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
