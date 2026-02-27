import { type Scene } from "@carma/cesium";

import { type PointMeasurementEntry } from "../types/MeasurementTypes";
import {
  useCesiumDistanceVisualizer,
  type CesiumDistanceVisualizerOptions,
} from "./useCesiumDistanceVisualizer";

export type CesiumDistanceCoreVisualizerHookOptions = Omit<
  CesiumDistanceVisualizerOptions,
  "renderDomVisuals" | "renderCesiumCoreVisuals"
> & {
  scene: Scene | null;
  points: PointMeasurementEntry[];
};

export const useCesiumDistanceCoreVisualizer = ({
  scene,
  points,
  ...options
}: CesiumDistanceCoreVisualizerHookOptions) => {
  useCesiumDistanceVisualizer(scene, points, {
    ...options,
    renderDomVisuals: false,
    renderCesiumCoreVisuals: true,
  });
};

export default useCesiumDistanceCoreVisualizer;
