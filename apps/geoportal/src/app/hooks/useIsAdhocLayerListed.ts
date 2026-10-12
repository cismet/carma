import { useCallback } from "react";

import { useMeasurement3dRuntimeServices } from "@carma-mapping/addons";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import {
  is3dAnnotationAdhocLayer,
  shouldShowAdhocLayerInLayerList,
} from "../helper/adhoc-feature-utils";

/**
 * Whether an adhoc layer gets a row in the layer list of the view on screen.
 * Saved 3D measurement sets also list in the MapLibre view while its 3D
 * measurement runs, which is what shows them there.
 */
export const useIsAdhocLayerListed = () => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const showsSaved3dMeasurements = useMeasurement3dRuntimeServices() !== null;
  return useCallback(
    (layer: Layer | BackgroundLayer): boolean =>
      shouldShowAdhocLayerInLayerList(layer, isCesium) ||
      (showsSaved3dMeasurements && is3dAnnotationAdhocLayer(layer)),
    [isCesium, showsSaved3dMeasurements]
  );
};
