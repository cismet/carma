import { useEffect } from "react";
import { useSelector } from "react-redux";

import { isLayerGroup } from "@carma-mapping/layers";

import { getLayerStack } from "../store/slices/mapping";
import { claimDailyLayerUsage } from "./dailyLayerUsage";
import { LayerAction, TrackingCategory, formatItemName } from "./taxonomy";
import { trackEvent } from "./tracker";

/**
 * Reports which layers are actually in use, once per layer per day.
 *
 * `hinzugefügt` only fires when someone picks a layer out of the catalog, so a
 * visitor who simply returns to the layers they set up last time never appeared
 * in the numbers at all. This watches the layer stack instead: whatever sits on
 * the map is counted once for the day, no matter how it got there - restored
 * from the previous session, opened from a shared link, or added by hand.
 *
 * A group itself is not reported - only the layers inside it, each on its own.
 * That keeps a layer visible in the reports even when it is used solely as part
 * of a group rather than added from the catalog by hand.
 *
 * Rows whose id starts with `__` are skipped: they are the layer bar's handles
 * on a running mode (measurement, comparison), not map content.
 */
export const LayerUsageTracking = () => {
  const layerStack = useSelector(getLayerStack);

  useEffect(() => {
    const report = (
      category: string,
      entry: { id?: string; title?: string }
    ) => {
      const id = entry?.id;
      if (!id || id.startsWith("__")) {
        return;
      }
      if (!claimDailyLayerUsage(id)) {
        return;
      }
      trackEvent(category, LayerAction.USED, formatItemName(entry.title, id));
    };

    layerStack.forEach((entry) => {
      if (isLayerGroup(entry)) {
        entry.layers.forEach((member) =>
          report(TrackingCategory.LAYER, member)
        );
        return;
      }
      report(TrackingCategory.LAYER, entry);
    });
  }, [layerStack]);

  return null;
};

export default LayerUsageTracking;
