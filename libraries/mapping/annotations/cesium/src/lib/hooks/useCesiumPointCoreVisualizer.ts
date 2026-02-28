import { type Scene } from "@carma/cesium";

import { type AnnotationCollection } from "../types/AnnotationTypes";
import {
  useCesiumPointVisualizer,
  type CesiumPointVisualizerOptions,
} from "./useCesiumPointVisualizer";

export type CesiumPointCoreVisualizerHookOptions = Omit<
  CesiumPointVisualizerOptions,
  "renderDomVisuals" | "renderCesiumCoreVisuals"
> & {
  scene: Scene | null;
  measurements?: AnnotationCollection;
};

export const useCesiumPointCoreVisualizer = ({
  scene,
  measurements = [],
  ...options
}: CesiumPointCoreVisualizerHookOptions) => {
  useCesiumPointVisualizer(scene, measurements, {
    ...options,
    renderDomVisuals: false,
    renderCesiumCoreVisuals: true,
  });
};

export default useCesiumPointCoreVisualizer;
