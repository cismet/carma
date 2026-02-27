import { type Scene } from "@carma/cesium";

import { type MeasurementCollection } from "../types/MeasurementTypes";
import {
  useCesiumPointVisualizer,
  type CesiumPointVisualizerOptions,
} from "./useCesiumPointVisualizer";

export type PointMeasureVisualizerHookOptions = CesiumPointVisualizerOptions & {
  scene: Scene | null;
  measurements?: MeasurementCollection;
};

export const usePointMeasureVisualizer = ({
  scene,
  measurements = [],
  ...options
}: PointMeasureVisualizerHookOptions) => {
  const {
    renderDomVisuals = true,
    renderCesiumCoreVisuals = true,
    ...pointOptions
  } = options;
  useCesiumPointVisualizer(scene, measurements, {
    ...pointOptions,
    renderDomVisuals,
    renderCesiumCoreVisuals,
  });
};

export default usePointMeasureVisualizer;
