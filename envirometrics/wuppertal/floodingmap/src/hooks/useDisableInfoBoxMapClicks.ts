import { useEffect } from "react";

import { DomEvent } from "leaflet";
import type { Map as LeafletMap } from "leaflet";

/**
 * Stop info-box clicks/scroll from leaking through to the Leaflet map. The
 * react-leaflet-control entry never calls disableClickPropagation, so clicks on
 * the box background bubble to the map and fire a feature-info request.
 */
export const useDisableInfoBoxMapClicks = (leafletMap: LeafletMap | null) => {
  useEffect(() => {
    if (!leafletMap) return;
    const corner = leafletMap
      .getContainer()
      .querySelector<HTMLElement>(".leaflet-bottom.leaflet-right");
    if (!corner || corner.dataset.infoboxClicksDisabled === "true") return;
    corner.dataset.infoboxClicksDisabled = "true";
    DomEvent.disableClickPropagation(corner);
    DomEvent.disableScrollPropagation(corner);
  }, [leafletMap]);
};
