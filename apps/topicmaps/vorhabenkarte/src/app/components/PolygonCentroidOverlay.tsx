import React, { useContext, useEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import centroid from "@turf/centroid";
import L from "leaflet";

const svgBadge = `
  <svg width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="#CF4647" />
    <text x="12" y="16" text-anchor="middle" fill="#fff" font-size="12">P</text>
  </svg>
`;

export function PolygonCentroidOverlay() {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { shownFeatures = [] } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );

  useEffect(() => {
    const map = routedMapRef?.leafletMap?.leafletElement;
    if (!map) return;
    const markers: L.Marker[] = [];

    shownFeatures
      .filter(
        (f) =>
          f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"
      )
      .forEach((f) => {
        const [x, y] = (centroid(f.geometry as any).geometry as GeoJSON.Point)
          .coordinates;
        const latlng = map.options.crs.projection.unproject(L.point(x, y));
        const icon = new L.DivIcon({
          html: svgBadge,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        const m = L.marker(latlng, {
          icon,
          interactive: false,
          zIndexOffset: 1000,
        }).addTo(map);
        markers.push(m);
      });

    return () => markers.forEach((m) => map.removeLayer(m));
  }, [routedMapRef, shownFeatures]);

  return null;
}
