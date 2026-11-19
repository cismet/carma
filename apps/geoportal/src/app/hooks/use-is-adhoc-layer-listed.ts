import { useCallback } from "react";

import { useMeasurement3dRuntimeServices } from "@carma-mapping/addons";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import {
  is3dAnnotationAdhocLayer,
  shouldShowAdhocLayerInLayerList,
} from "../helper/adhoc-feature-utils";
import { useIs3dView } from "./useIs3dView";

/**
 * Whether an adhoc layer gets a row in the layer list of the view on screen.
 * Saved 3D measurement sets also list in the MapLibre view while its 3D
 * measurement runs, which is what shows them there.
 */
export const useIsAdhocLayerListed = () => {
  const is3dView = useIs3dView();
  const showsSaved3dMeasurements = useMeasurement3dRuntimeServices() !== null;
  return useCallback(
    (layer: Layer | BackgroundLayer): boolean =>
      shouldShowAdhocLayerInLayerList(layer, is3dView) ||
      (showsSaved3dMeasurements && is3dAnnotationAdhocLayer(layer)),
    [is3dView, showsSaved3dMeasurements]
  );
};
