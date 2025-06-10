import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { getHashParams } from "@carma-commons/utils";

import "./map.css";
import { vectorStylesToMapLibreStyle } from "./libremap.utils";

interface LibreMapProps {
  vectorStyles?: string[];
  setLibreMap: (map: maplibregl.Map) => void;
}

export const LibreMap = ({ vectorStyles, setLibreMap }: LibreMapProps) => {
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
    // Only initialize if we have a container and no map yet
    if (mapContainer.current && !map.current) {
      const hashParams = getHashParams();

      const lng =
        hashParams["lng"] !== undefined
          ? parseFloat(hashParams["lng"])
          : defaultLng;

      const lat =
        hashParams["lat"] !== undefined
          ? parseFloat(hashParams["lat"])
          : defaultLat;

      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: backgroundStyle,
        center: [lng, lat],
        zoom: defaultZoom,
      });
      map.current = mapInstance;
      setLibreMap(mapInstance);
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current || !vectorStyles) return;

    const updateMapStyle = async () => {
      try {
        const style = await vectorStylesToMapLibreStyle(vectorStyles);
        map.current?.setStyle(style);
      } catch (error) {
        console.error("Error updating map style:", error);
      }
    };

    updateMapStyle();
  }, [vectorStyles]);

  return (
    <div className="map-wrap">
      <div ref={mapContainer} className="map" />
    </div>
  );
};

export default LibreMap;
