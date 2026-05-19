import { useContext, useEffect } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import pointOnFeature from "@turf/point-on-feature";
import L from "leaflet";
import { getFeatureStyler } from "../../helper/styler";

export const FeatureIconOverlay = ({
  zoomLevel = 12,
  markerSymbolSize = 36,
}) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { shownFeatures = [] } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );
  const { setSelectedFeatureByPredicate } = useContext<
    typeof FeatureCollectionContext
  >(FeatureCollectionDispatchContext);

  const styleFn = getFeatureStyler(markerSymbolSize);

  useEffect(() => {
    const map = routedMapRef?.leafletMap?.leafletElement;
    if (!map) return;
    const updateOverlayVisibility = () => {
      const zoom = map.getZoom();
      map.getPane("overlayPane")!.style.display =
        zoom < zoomLevel ? "none" : "";
    };
    map.on("zoomend", updateOverlayVisibility);
    updateOverlayVisibility();

    const markers: L.Marker[] = [];
    const dropMarkerAt = (
      g: GeoJSON.Geometry | GeoJSON.MultiPolygon,
      feature
    ) => {
      const point = pointOnFeature(g as any).geometry as GeoJSON.Point;
      const [x, y] = point.coordinates;
      const latlng = map.options.crs.projection.unproject(L.point(x, y));

      const { svg: html, svgSize: size } = styleFn(feature);
      const icon = new L.DivIcon({
        html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        className: "transparent-marker",
      });

      const marker = L.marker(latlng, {
        icon,
        interactive: true,
        zIndexOffset: 497,
      }).addTo(map);

      marker.on("click", () => {
        setSelectedFeatureByPredicate(
          (f) => f.properties.id === feature.properties.id
        );
      });

      markers.push(marker);
    };

    shownFeatures.forEach((feature) => {
      const geom = feature.geometry;
      if (geom.type === "Polygon" || geom.type === "LineString") {
        dropMarkerAt(geom, feature);
      } else if (
        geom.type === "MultiPolygon" ||
        geom.type === "MultiLineString"
      ) {
        geom.coordinates.forEach((coords) => {
          const fType = geom.type === "MultiPolygon" ? "Polygon" : "LineString";
          const subPoly: GeoJSON.Polygon | GeoJSON.LineString = {
            type: fType,
            coordinates: coords,
          };
          dropMarkerAt(subPoly, feature);
        });
      }
    });

    return () => markers.forEach((m) => map.removeLayer(m));
  }, [routedMapRef, shownFeatures, markerSymbolSize]);

  return null;
};
