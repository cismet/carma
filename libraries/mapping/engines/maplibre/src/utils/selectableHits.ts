import type { MapGeoJSONFeature } from "maplibre-gl";

import { SELECTION_OVERLAY_LAYER_IDS } from "../components/LibreMapSelectionContent";
import { isNonSelectable, ownLayerId } from "../lib/SelectionManager";

/**
 * Whether a click hit can be selected. The engine's click listener drops a
 * layer's own selection highlight and its clusters (they carry the layer's id
 * and the object's properties, so they would stand in for the object), the
 * gazetteer overlay, and layers marked non-selectable. Shared with code that
 * picks the object to select itself, so both agree on what counts.
 */
export const isSelectableHit = (hit: MapGeoJSONFeature): boolean => {
  const own = ownLayerId(hit);
  return (
    !own.includes("selection") &&
    !own.includes("cluster") &&
    !SELECTION_OVERLAY_LAYER_IDS.includes(hit.layer.id) &&
    !isNonSelectable(hit)
  );
};
