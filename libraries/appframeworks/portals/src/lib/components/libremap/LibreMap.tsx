import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
// import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { getHashParams } from "@carma-commons/utils";

import "./map.css";
const LibreMap = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  const defaultLng = 7.150764;
  const defaultLat = 51.256;
  const defaultZoom = 15;

  const backgroundStyle: StyleSpecification = {
    version: 8,
    sources: {
      "source-amtlich": {
        type: "raster",
        tiles: [
          "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
        ],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "layer-amtlich",
        type: "raster",
        source: "source-amtlich",
        paint: { "raster-opacity": 0.9 },
      },
    ],
  };

  useEffect(() => {
    console.log("Map container:", mapContainer.current);
    if (map.current) {
      console.log("Map already initialized");
      return;
    }

    const hashParams = getHashParams();

    if (mapContainer.current) {
      const lng =
        hashParams["lng"] !== undefined
          ? parseFloat(hashParams["lng"])
          : defaultLng;

      const lat =
        hashParams["lat"] !== undefined
          ? parseFloat(hashParams["lat"])
          : defaultLat;
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: backgroundStyle,
      });
      console.log("Map initialized:", map.current);

      // Add event listener to check when map is loaded
      map.current.on("load", () => {
        console.log("Map loaded successfully");
      });

      map.current.on("error", (e) => {
        console.error("Map error:", e);
      });
    }

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  return (
    <div className="map-wrap">
      <div ref={mapContainer} className="map" />
    </div>
  );
};

export default LibreMap;
