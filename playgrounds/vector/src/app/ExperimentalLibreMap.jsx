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
const uniqueColors = [...new Set(transformedPois.features.map(f => f.properties.schrift))];

function createDonutChart(props) {
  const offsets = [];
  const counts = uniqueColors.map(color => props[color] || 0);
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    offsets.push(total);
    total += counts[i];
  }
  const fontSize = total >= 1000 ? 22 : total >= 100 ? 20 : total >= 10 ? 18 : 16;
  const r = total >= 1000 ? 50 : total >= 100 ? 32 : total >= 10 ? 24 : 18;
  const r0 = Math.round(r * 0.6);
  const w = r * 2;

  let html = `<div><svg width="${w}" height="${w}" viewbox="0 0 ${w} ${w}" text-anchor="middle" style="font: ${fontSize}px sans-serif; display: block">`;

  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0) {
      html += donutSegment(
        offsets[i] / total,
        (offsets[i] + counts[i]) / total,
        r,
        r0,
        uniqueColors[i]
      );
    }
  }
  html += `<circle cx="${r}" cy="${r}" r="${r0}" fill="white" />
           <text dominant-baseline="central" transform="translate(${r}, ${r})">${total.toLocaleString()}</text></svg></div>`;

  const el = document.createElement('div');
  el.innerHTML = html;
  return el.firstChild;
}

function donutSegment(start, end, r, r0, color) {
  if (end - start === 1) end -= 0.00001;
  const a0 = 2 * Math.PI * (start - 0.25);
  const a1 = 2 * Math.PI * (end - 0.25);
  const x0 = Math.cos(a0), y0 = Math.sin(a0);
  const x1 = Math.cos(a1), y1 = Math.sin(a1);
  const largeArc = end - start > 0.5 ? 1 : 0;

  return [
    '<path d="M',
    r + r0 * x0,
    r + r0 * y0,
    'L',
    r + r * x0,
    r + r * y0,
    'A',
    r,
    r,
    0,
    largeArc,
    1,
    r + r * x1,
    r + r * y1,
    'L',
    r + r0 * x1,
    r + r0 * y1,
    'A',
    r0,
    r0,
    0,
    largeArc,
    0,
    r + r0 * x0,
    r + r0 * y0,
    `" fill="${color}" />`
  ].join(' ');
}

export default function LibreMap({ opacity = 0.1, vectorStyles = [] }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng] = useState(7.150764);
  const [lat] = useState(51.256);
  const [zoom] = useState(12);
  const markers = useRef({});
  const markersOnScreen = useRef({});

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
        clusterProperties: Object.fromEntries(
          uniqueColors.map(color => [
            color,
            ["+", ["case", ["==", ["get", "schrift"], color], 1, 0]]
          ])
        )
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
      }
    ],
  };

  function updateMarkers() {
    const newMarkers = {};
    const features = map.current.querySourceFeatures('poi-source');

    for (const feature of features) {
      const coords = feature.geometry.coordinates;
      const props = feature.properties;
      if (!props.cluster) continue;
      const id = props.cluster_id;

      let marker = markers.current[id];
      if (!marker) {
        const el = createDonutChart(props);
        marker = markers.current[id] = new maplibregl.Marker({
          element: el
        }).setLngLat(coords);
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

      map.current.on('error', (e) => {
        console.error('Map error:', e);
      });

      map.current.on('style.error', (e) => {
        console.error('Style error:', e);
      });

      map.current.on('source.error', (e) => {
        console.error('Source error:', e);
      });

      map.current.on("load", function () {
        console.log("Map loaded successfully");

        try {
          map.current.addControl(new maplibregl.NavigationControl(), "top-left");

          // Set up marker updates
          map.current.on('data', (e) => {
            if (e.sourceId !== 'poi-source' || !e.isSourceLoaded) return;
            map.current.on('move', updateMarkers);
            map.current.on('moveend', updateMarkers);
            updateMarkers();
          });

          // Handle cluster click
          map.current.on("click", "clusters", (e) => {
            const features = map.current.queryRenderedFeatures(e.point, {
              layers: ["clusters"],
            });
            if (features.length === 0) return;

            const currentZoom = map.current.getZoom();
            const pointCount = features[0].properties.point_count;
            const zoomIncrement = pointCount > 100 ? 3 : pointCount > 50 ? 2 : 1;
            const newZoom = Math.min(
              currentZoom + zoomIncrement,
              map.current.getMaxZoom()
            );

            map.current.easeTo({
              center: features[0].geometry.coordinates,
              zoom: newZoom,
            });
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
