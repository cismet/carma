import { useEffect } from "react";

import type { AddonComponentProps } from "../../lib/registry";

export type TiltedModelsConfig = {
  /** pitch (degrees) above which models replace their footprints; default 1 */
  minPitch?: number;
};

/**
 * The 3D model an object layer's feature declares (`carmaConf3D.model`, the
 * one Cesium renders) in place of its footprint while the MapLibre map is
 * tilted; flat, the footprint is back. A click on the model selects the
 * footprint feature. Nothing to configure per layer: a catalog entry whose
 * style carries a model is enough. The addon never tilts the map itself.
 */
export const TiltedModels = ({
  config,
  libreMap,
}: AddonComponentProps<"tiltedModels">) => {
  const minPitch = config?.minPitch;

  useEffect(() => {
    if (!libreMap) {
      return;
    }
    let stop: (() => void) | null = null;
    let cancelled = false;
    // three.js and the loaders stay out of the route's chunk until a map is there
    void import("./tilted-models-runtime").then(({ startTiltedModels }) => {
      if (!cancelled) {
        stop = startTiltedModels(libreMap, { minPitch });
      }
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [libreMap, minPitch]);

  return null;
};
