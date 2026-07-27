import { useEffect, useRef } from "react";
import L from "leaflet";
import { useSelector } from "react-redux";
import type { Map as LeafletMap } from "leaflet";

import { getSelectedFeature } from "../../store/slices/features";

/**
 * Dim the clicked feature on the Geoportal (Leaflet) map.
 *
 * WHY AN OVERLAY: real Geoportal features are drawn either into a MapLibre
 * `<canvas>` (vector layers) or a server-rendered WMS `<img>` (raster layers).
 * Neither exposes a single feature as a Leaflet object, so we cannot restyle
 * the feature in place from Leaflet. Instead we draw our OWN shape on top of
 * the clicked feature's geometry — a translucent dark "mask" that darkens it.
 * This works regardless of the underlying layer type.
 *
 * Signal: the real click flows through `onClickTopicMap` -> Redux
 * `selectedFeature` (a `FeatureInfo`). Its `geometry` is GeoJSON in WGS84
 * (`[lng, lat]`), which `L.geoJSON` consumes directly.
 *
 * NOTE: for MapLibre *vector* layers the "proper" in-place dim is
 * `setFeatureState({ dimmed }) + a paint opacity expression` (cismap already
 * uses this pattern for `selected`). This overlay is the source-agnostic
 * version that also covers WMS raster.
 */

const HIGHLIGHT_PANE = "carma-highlight";

// Translucent dark mask -> darkens whatever is beneath it = "dimmed".
const DIM_STYLE: L.PathOptions = {
  stroke: false,
  fillColor: "#000000",
  fillOpacity: 0.45,
};

const useLeafletHighlighting = (
  getLeafletMap: () => LeafletMap | undefined
) => {
  const selectedFeature = useSelector(getSelectedFeature);
  const overlayRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    const map = getLeafletMap();
    if (!map) return;

    // Dedicated pane above the layer panes so the mask sits on top.
    if (!map.getPane(HIGHLIGHT_PANE)) {
      map.createPane(HIGHLIGHT_PANE);
      const pane = map.getPane(HIGHLIGHT_PANE);
      if (pane) pane.style.zIndex = "651";
    }

    // Remove the previous mask (each click dims only the current feature).
    if (overlayRef.current) {
      overlayRef.current.remove();
      overlayRef.current = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geometry: any = selectedFeature?.geometry;
    // Skip the "information" pseudo-feature (a bare click with no geometry).
    if (!geometry?.coordinates) return;

    overlayRef.current = L.geoJSON(geometry, {
      pane: HIGHLIGHT_PANE,
      // Lines / polygons: fill them with the dark mask.
      style: DIM_STYLE,
      // Points (POI icons): a disc covering the icon.
      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 16,
          pane: HIGHLIGHT_PANE,
          ...DIM_STYLE,
        }),
    }).addTo(map);
  }, [selectedFeature, getLeafletMap]);

  // Clean up when the map component unmounts.
  useEffect(
    () => () => {
      overlayRef.current?.remove();
      overlayRef.current = null;
    },
    []
  );
};

export default useLeafletHighlighting;
