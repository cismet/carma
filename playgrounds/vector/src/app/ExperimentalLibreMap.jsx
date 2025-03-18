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

function createPieChart(props) {
  const offsets = [];
  const counts = uniqueColors.map((color) => props[color] || 0);
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    offsets.push(total);
    total += counts[i];
  }
  const baseFontsize = 10;
  const fontSize =
    total >= 1000
      ? baseFontsize * 1.375
      : total >= 100
      ? baseFontsize * 1.25
      : total >= 10
      ? baseFontsize * 1.125
      : baseFontsize;
  const baseCircleSize = 20;
  const r =
    total >= 1000
      ? baseCircleSize * 2.777
      : total >= 100
      ? baseCircleSize * 1.7777
      : total >= 10
      ? baseCircleSize * 1.3333
      : baseCircleSize;
  const w = r * 2;
  const svgSize = w + 2; // 1px extra on each side

  let html = `<div><svg width="${svgSize}" height="${svgSize}" viewbox="0 0 ${svgSize} ${svgSize}" text-anchor="middle" style="font: ${fontSize}px sans-serif; display: block">`;

  // Translate the group to center the content in the larger SVG
  html += `<g transform="translate(1,1)">`;

  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0) {
      html += pieSegment(
        offsets[i] / total,
        (offsets[i] + counts[i]) / total,
        r,
        uniqueColors[i]
      );
    }
  }

  html += `<circle cx="${r}" cy="${r}" r="${Math.round(
    r * 0.4
  )}" fill="white" fill-opacity="0.75"/>`;
  html += `<circle cx="${r}" cy="${r}" r="${r}" stroke="#000" stroke-width="1" fill="none"/>`;
  html += `<text dominant-baseline="central" transform="translate(${r}, ${r})">${total.toLocaleString()}</text></g></svg></div>`;

  const el = document.createElement("div");
  el.innerHTML = html;
  return el.firstChild;
}

function pieSegment(start, end, r, color) {
  if (end - start === 1) end -= 0.00001;
  const a0 = 2 * Math.PI * (start - 0.25);
  const a1 = 2 * Math.PI * (end - 0.25);
  const x0 = Math.cos(a0),
    y0 = Math.sin(a0);
  const x1 = Math.cos(a1),
    y1 = Math.sin(a1);
  const largeArc = end - start > 0.5 ? 1 : 0;

  return [
    '<path d="M',
    r,
    r,
    "L",
    r + r * x0,
    r + r * y0,
    "A",
    r,
    r,
    0,
    largeArc,
    1,
    r + r * x1,
    r + r * y1,
    "Z",
    `" fill="${color}" />`,
  ].join(" ");
}

export default function LibreMap({ opacity = 0.1, vectorStyles = [] }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng] = useState(7.150764);
  const [lat] = useState(51.256);
  const [zoom] = useState(11);
  const markers = useRef({});
  const markersOnScreen = useRef({});
  const lastZoom = useRef(null);

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
        // type: "vector",
        // tiles: ["https://tiles.cismet.de/poi/{z}/{x}/{y}.pbf"],

        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
        clusterProperties: Object.fromEntries(
          uniqueColors.map((color) => [
            color,
            ["+", ["case", ["==", ["get", "schrift"], color], 1, 0]],
          ])
        ),
      },
    },
    glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
    sprite: "https://tiles.cismet.de/poi/sprites",
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
          "circle-color": "rgba(0,0,0,0)",
          "circle-radius": 20,
        },
      },
      // {
      //   id: "poi-circles",
      //   type: "circle",
      //   source: "poi-source",
      //   filter: ["!", ["has", "point_count"]],
      //   paint: {
      //     "circle-radius": 6,
      //     "circle-color": ["get", "schrift"],
      //     "circle-stroke-width": 1,
      //     "circle-stroke-color": "#ffffff",
      //   },
      // },
      {
        id: "poi-images",
        type: "symbol",
        source: "poi-source",
        minzoom: 0,
        maxzoom: 24,
        filter: ["!", ["has", "point_count"]],
        layout: {
          visibility: "visible",
          "symbol-z-order": "source",
          "symbol-sort-key": ["get", "geographicidentifier"],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": {
            stops: [
              [9, 0.32],
              [24, 0.8],
            ],
          },
          "icon-padding": 0,
          "icon-image": ["concat", ["get", "signatur"], ["get", "schrift"]],
        },
        paint: {
          "icon-color": ["get", "schrift"],
        },
      },
      {
        id: "poi-labels",
        type: "symbol",
        source: "poi-source",
        filter: ["!", ["has", "point_count"]],
        minzoom: 16,
        maxzoom: 24,
        layout: {
          "text-field": ["get", "geographicidentifier"],
          "text-font": ["Open Sans Semibold"],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "text-size": 12,
          "text-offset": {
            stops: [
              [17, [0, 1.3]],
              [24, [0, 2]],
            ],
          },
          "text-anchor": "top",
          "text-allow-overlap": true,
          "text-rotation-alignment": "viewport",
        },
        paint: {
          "text-halo-color": "#FFFFFF",
          "text-halo-width": 5,
          "text-color": ["get", "schrift"],
          "text-opacity": 1,
        },
      },
    ],
  };

  function updateMarkers() {
    const newMarkers = {};
    const features = map.current.querySourceFeatures("poi-source");

    for (const feature of features) {
      const coords = feature.geometry.coordinates;
      const props = feature.properties;
      if (!props.cluster) continue;
      const id = props.cluster_id;

      let marker = markers.current[id];
      if (!marker) {
        const el = createPieChart(props);
        marker = markers.current[id] = new maplibregl.Marker({
          element: el,
        }).setLngLat(coords);

        // Add click handler to the marker element
        el.addEventListener("click", () => {
          const currentZoom = map.current.getZoom();
          const pointCount = props.point_count;
          const zoomIncrement = pointCount > 100 ? 3 : pointCount > 50 ? 2 : 1;
          const newZoom = Math.min(
            currentZoom + zoomIncrement,
            map.current.getMaxZoom()
          );
          map.current.flyTo({
            center: coords,
            zoom: newZoom,
            essential: true,
          });
        });
      }
      newMarkers[id] = marker;

      if (!markersOnScreen.current[id]) marker.addTo(map.current);
    }

    // Remove markers that are no longer visible
    for (const id in markersOnScreen.current) {
      if (!newMarkers[id]) {
        markersOnScreen.current[id].remove();
      }
    }
    markersOnScreen.current = newMarkers;
  }

  useEffect(() => {
    if (map.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: backgroundStyle,
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

          // Log zoom level changes
          map.current.on("zoom", function () {
            const currentZoom = map.current.getZoom();
            const roundedZoom = Math.round(currentZoom * 100) / 100;

            // if (lastZoom.current !== roundedZoom) {
            //   console.log(`Current zoom level: ${roundedZoom}`);
            //   lastZoom.current = roundedZoom;
            // }
          });

          // Set up marker updates
          map.current.on("data", function handler(e) {
            if (e.sourceId !== "poi-source" || !e.isSourceLoaded) return;
            map.current.off("data", handler);
            map.current.on("move", updateMarkers);
            map.current.on("moveend", () => {
              setTimeout(() => {
                updateMarkers();
              }, 100);
            });
            updateMarkers();
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
