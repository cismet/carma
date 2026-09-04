import { useMemo } from "react";

import { applyAddonOverrides } from "./addon-overrides";
import { usePersistedAddonOverrides } from "./addon-overrides-storage";
import { useRouteAddons } from "./AddonStateContext";
import {
  addonRegistry,
  resolveAddonEntries,
  type AddonStateKey,
} from "./registry";

/**
 * Whether an addon that writes `channel` is mounted on this route. Overrides
 * are applied, so the answer is what `AddonHost` actually renders and not what
 * the route declared: the manager can switch a producer off, and it can switch
 * one on that the route never named.
 *
 * A mode's layer-bar row lives in the host app's tree rather than in the
 * addon's, and the row is persisted while the channel is not. So a row can
 * outlive its engine and come back on a route that mounts nothing able to draw
 * it, which is a control with nothing behind it. The row hooks ask here and
 * drop the row instead. A route offering a mode has to declare the addon; that
 * declaration is what makes the mode part of the route, see #4055.
 */
export const useHasAddonStateProducer = (channel: AddonStateKey): boolean => {
  const addons = useRouteAddons();
  const [overrides] = usePersistedAddonOverrides();
  return useMemo(
    () =>
      applyAddonOverrides(resolveAddonEntries(addons), overrides).some(
        ({ kind }) => addonRegistry[kind].provides?.includes(channel)
      ),
    [addons, overrides, channel]
  );
};
