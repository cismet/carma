import { useEffect } from "react";
import { useStore } from "react-redux";

import { registerFeatureSelector2D } from "@carma-api";
import { useLibreContext } from "@carma-mapping/contexts";
import { selectRenderedFeature } from "@carma-mapping/engines/maplibre";

import { describeSelection } from "../helper/describe-selection";
import type { RootState } from "../store";

const SELECTION_TIMEOUT_MS = 10_000;
const POLL_MS = 100;

type FeaturesState = RootState["features"];

/** waits for a click's selection to land and its feature info query to end */
const awaitSelection = async (
  getFeatures: () => FeaturesState,
  before: FeaturesState["selectedFeature"]
) => {
  const deadline = Date.now() + SELECTION_TIMEOUT_MS;
  for (;;) {
    const features = getFeatures();
    if (features.selectedFeature !== before && !features.loading) {
      return {
        selected: describeSelection(features.selectedFeature),
        more: features.secondaryInfoBoxElements.length,
      };
    }
    if (Date.now() >= deadline) {
      return { selected: null, more: 0 };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
};

/**
 * Registers `carma.mapping2D.selectFeature` for the libre map: the engine
 * clicks the object (`selectRenderedFeature`), and the answer is what the
 * info box then shows.
 */
export const useFeatureSelector = (): void => {
  const store = useStore<RootState>();
  const { map: libreMap } = useLibreContext();

  useEffect(() => {
    if (!libreMap) {
      return;
    }
    const getFeatures = () => store.getState().features;
    registerFeatureSelector2D(async (request) => {
      const before = getFeatures().selectedFeature;
      const click = await selectRenderedFeature(libreMap, request);
      return { ...click, ...(await awaitSelection(getFeatures, before)) };
    });
    return () => registerFeatureSelector2D(null);
  }, [libreMap, store]);
};
