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

export default function LibreMap({ opacity = 0.1, vectorStyles = [] }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng] = useState(7.150764);
  const [lat] = useState(51.256);
  const [zoom] = useState(12);

  const backgroundStyle = {
    version: 8,
    sources: {
      rvr_wms: {
        type: "raster",
        tiles: [
          "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
        ],
        tileSize: 256,
      },
      "poi-source": {
        type: "geojson",
        data: transformedPois,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      },
    },
    layers: [
      {
        id: "wms-test-layer",
        type: "raster",
        opacity: 0.25,

        source: "rvr_wms",
        paint: { "raster-opacity": 0.7 },
      },
      {
        id: "clusters",
        type: "circle",
        source: "poi-source",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#666666",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            15,
            50,
            20,
            100,
            25,
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      },
      {
        id: "poi-circles",
        type: "circle",
        source: "poi-source",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "schrift"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      },
    ],
  };

  useEffect(() => {
    if (map.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: backgroundStyle,
      center: [lng, lat],
      zoom: zoom,
      opacity: 1,
      maxZoom: 22,
    });

    console.log("Map initialized:", map.current);

    map.current.on("load", function () {
      console.log("Style loaded");
      map.current.addControl(new maplibregl.NavigationControl(), "top-left");

      // Debug source
      const source = map.current.getSource("poi-source");
      console.log("POI source:", source);

      // Handle cluster click
      map.current.on("click", "clusters", (e) => {
        console.log("Cluster clicked!");
        const features = map.current.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        console.log("Features found:", features);
        if (features.length === 0) {
          console.log("No features found at click point");
          return;
        }
        
        // Get current zoom and calculate zoom increment based on point count
        const currentZoom = map.current.getZoom();
        const pointCount = features[0].properties.point_count;
        // Zoom in more for larger clusters
        const zoomIncrement = pointCount > 100 ? 3 : (pointCount > 50 ? 2 : 1);
        const newZoom = Math.min(currentZoom + zoomIncrement, map.current.getMaxZoom());
        console.log("Points in cluster:", pointCount, "Current zoom:", currentZoom, "New zoom:", newZoom);
        
        map.current.easeTo({
          center: features[0].geometry.coordinates,
          zoom: newZoom
        });
      });

      // Change cursor on cluster hover
      map.current.on("mouseenter", "clusters", () => {
        map.current.getCanvas().style.cursor = "pointer";
      });
      map.current.on("mouseleave", "clusters", () => {
        map.current.getCanvas().style.cursor = "";
      });
    });

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
