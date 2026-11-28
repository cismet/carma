import { useCallback } from "react";

import { useMeasurement3dRuntimeServices } from "@carma-mapping/addons";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import {
  is3dAnnotationAdhocLayer,
  shouldShowAdhocLayerIn2dLayerList,
} from "../helper/adhoc-feature-utils";

/**
 * Whether an adhoc layer gets a row in the layer list of the view on screen.
 * Saved 3D measurement sets also list in the MapLibre view while its 3D
 * measurement runs, which is what shows them there.
 */
export const useIsAdhocLayerListed = () => {
  const showsSaved3dMeasurements = useMeasurement3dRuntimeServices() !== null;
  return useCallback(
    (layer: Layer | BackgroundLayer): boolean =>
      shouldShowAdhocLayerIn2dLayerList(layer) ||
      (showsSaved3dMeasurements && is3dAnnotationAdhocLayer(layer)),
    [showsSaved3dMeasurements]
  );
};
