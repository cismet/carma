import { useEffect } from "react";

import { DomEvent } from "leaflet";
import type { Map as LeafletMap } from "leaflet";

/**
 * Stop info-box clicks from leaking through to the map.
 *
 * The EnviroMetricMap info box is rendered into the Leaflet bottom-right
 * control corner via `react-leaflet-control`. Its main entry (`control.js`,
 * unlike `Control.Dumb.js`) never calls `disableClickPropagation`, and the
 * library only stops propagation on the inner legend table — so clicks on the
 * box background/header/toggle bubble up to the Leaflet map's click handler and
 * fire a feature-info request. This happens in both 2D and 3D, because the
 * Leaflet map stays mounted (behind the Cesium canvas, which never receives the
 * click since the box sits on top of it).
 *
 * Marking the control corner with Leaflet's own `disableClickPropagation` sets
 * `_leaflet_disable_click`, so the map's `_isClickDisabled` walk ignores clicks
 * originating in the box, while the box's own buttons keep working (their
 * handlers run before propagation is stopped at the corner). `disableScroll-
 * Propagation` likewise stops wheel-over-box from zooming the map.
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
