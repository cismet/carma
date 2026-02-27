import { type Scene } from "@carma/cesium";

import { type PointMeasurementEntry } from "../types/MeasurementTypes";
import {
  useCesiumDistanceVisualizer,
  type CesiumDistanceVisualizerOptions,
} from "./useCesiumDistanceVisualizer";

export type DistanceVisualizerHookOptions = CesiumDistanceVisualizerOptions & {
  scene: Scene | null;
  points: PointMeasurementEntry[];
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

export const useDistanceRelationsVisualizer = useDistanceVisualizer;

export default useDistanceVisualizer;
