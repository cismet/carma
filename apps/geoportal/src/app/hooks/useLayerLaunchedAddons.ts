import { useMemo } from "react";
import { useSelector } from "react-redux";
import { createSelector } from "@reduxjs/toolkit";

import {
  getLayerLaunchedAddons,
  withLayerLaunchedAddons,
  type AddonEntry,
} from "@carma-mapping/addons";

import { getLayers } from "../store/slices/mapping";
import { getUIVisibleControls } from "../store/slices/ui";

/**
 * The engines the layer stack launches, as a string. The stack changes on every
 * opacity nudge; the string only changes when a launched config does, so the
 * app neither re-renders nor relaunches a fleet for anything else.
 *
 * The engine rows are hosted by the layer buttons (`LayerWrapper`), which also
 * write them. A route without the buttons, like the outlet, never writes one:
 * a row it has came with a stack handed over from elsewhere (a pm-show scene),
 * so there the row is what launches the service.
 */
const getLaunchedAddonsKey = createSelector(
  [getLayers, getUIVisibleControls],
  (layers, visibleControls) =>
    JSON.stringify(
      getLayerLaunchedAddons(layers, {
        includeEngineRow: !visibleControls.layerButtons,
      }).map(({ entry }) => entry)
    )
);

/**
 * The route's addons with the engines a layer in the stack launches, e.g. the
 * Schwebebahn a dropped-in style declares in its metadata.
 */
export const useLayerLaunchedAddons = (addons?: AddonEntry[]) => {
  const launchedKey = useSelector(getLaunchedAddonsKey);
  return useMemo(
    () =>
      withLayerLaunchedAddons(addons, JSON.parse(launchedKey) as AddonEntry[]),
    [addons, launchedKey]
  );
};
