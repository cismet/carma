import { type Scene } from "@carma/cesium";
import { type AnnotationCollection } from "@carma-mapping/annotations/core";

import {
  useCesiumPointVisualizer,
  type CesiumPointVisualizerOptions,
  useCesiumPointDomVisualizer,
} from "@carma-mapping/annotations/cesium";

export type PointMeasureVisualizerHookOptions = CesiumPointVisualizerOptions & {
  scene: Scene | null;
  annotations?: AnnotationCollection;
};

export const usePointMeasureVisualizer = ({
  scene,
  annotations = [],
  ...options
}: PointMeasureVisualizerHookOptions) => {
  const {
    renderDomVisuals = true,
    renderCesiumCoreVisuals = true,
    ...pointOptions
  } = options;
  useCesiumPointVisualizer(scene, annotations, {
    ...pointOptions,
    renderCesiumCoreVisuals,
  });

  useCesiumPointDomVisualizer(scene, annotations, {
    ...pointOptions,
    renderDomVisuals,
  });
};

export default usePointMeasureVisualizer;
