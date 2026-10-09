import { useMemo } from "react";
import { useCesiumAnnotationEngine } from "@carma-mapping/annotations/cesium";
import type { AnnotationEngine } from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";

export type GeoportalAnnotationEngineState = {
  engine: AnnotationEngine | null;
  /** The 3D view hosts the app's annotation runtime. */
  is3dAnnotationHost: boolean;
};

/**
 * The engine behind the app's own annotation runtime: the Cesium adapter
 * while the 3D view is active, none otherwise. The MapLibre view gets its 3D
 * measurements from the `measurement3d` addon instead, which brings its own
 * runtime on the shared Three.js scene.
 */
export const useGeoportalAnnotationEngine =
  (): GeoportalAnnotationEngineState => {
    const { getScene } = useCesiumContext();
    const { isCesium } = useMapFrameworkSwitcherContext();
    const scene = getScene();
    const engine = useCesiumAnnotationEngine(isCesium ? scene : null);
    return useMemo(
      () => ({ engine, is3dAnnotationHost: engine !== null }),
      [engine]
    );
  };
