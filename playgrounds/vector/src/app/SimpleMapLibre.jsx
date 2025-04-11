import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./mapLibre.css";
import { Button } from "react-bootstrap";
import { Map } from "maplibre-gl";
import pois from "./poi.json";

// Convert EPSG:3857 to WGS84 (EPSG:4326)
function convertTo4326(x, y) {
  const lng = (x * 180) / 20037508.34;
  const lat =
    (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90;
  return [lng, lat];
}

// Transform POI data to WGS84
const transformedPois = {
  ...pois,
  features: pois.features.map((feature) => ({
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: convertTo4326(...feature.geometry.coordinates),
    },
  })),
};

// Get unique colors from POIs
const uniqueColors = [
  ...new Set(transformedPois.features.map((f) => f.properties.schrift)),
];

export default function SimpleMapLibreMap({
  opacity = 0.1,
  vectorStyles = [],
}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng] = useState(7.150764);
  const [lat] = useState(51.256);
  const [zoom] = useState(5);

  const lastZoom = useRef(null);

  useEffect(() => {
    if (map.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: "https://demotiles.maplibre.org/style.json",
        center: [lng, lat],
        zoom: zoom,
        opacity: 1,
        maxZoom: 22,
      });

      map.current.on("error", (e) => {
        console.error("Map error:", e);
      });

      map.current.on("style.error", (e) => {
        console.error("Style error:", e);
      });

      map.current.on("source.error", (e) => {
        console.error("Source error:", e);
      });

      map.current.on("style.load", function () {
        console.log("Map style loaded successfully");

        try {
          map.current.addControl(
            new maplibregl.NavigationControl(),
            "top-left"
          );
          map.current.showTileBoundaries = true;

          // Log zoom level changes
          map.current.on("zoom", function () {
            const currentZoom = map.current.getZoom();
            const roundedZoom = Math.round(currentZoom * 100) / 100;

            // if (lastZoom.current !== roundedZoom) {
            //   console.log(`Current zoom level: ${roundedZoom}`);
            //   lastZoom.current = roundedZoom;
            // }
          });
        } catch (e) {
          console.error("Error setting up map controls:", e);
        }
      });
    } catch (e) {
      console.error("Error initializing map:", e);
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  return (
    <div className="map-wrap">
      <div ref={mapContainer} className="map" />
    </div>
  );
}
