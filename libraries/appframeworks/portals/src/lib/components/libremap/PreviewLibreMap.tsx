import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { useLibreContext } from "./LibreContext";

interface PreviewLibreMapProps {
  lat?: number;
  lng?: number;
  zoom?: number;
  style?: React.CSSProperties;
}

const defaultContainerStyle: React.CSSProperties = {
  width: "100%",
  height: 300,
};

const defaultMapStyle: StyleSpecification = {
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
      paint: { "raster-opacity": 1 },
    },
  ],
};

export const PreviewLibreMap = ({
  lat = 51.2725699,
  lng = 7.199918,
  zoom = 15,
  style = defaultContainerStyle,
}: PreviewLibreMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const { mapStyle } = useLibreContext();

  useEffect(() => {
    if (mapContainer.current && !map.current) {
      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: mapStyle ?? defaultMapStyle,
        center: [lng, lat],
        zoom: zoom,
        attributionControl: false,
        interactive: false,
      });

      map.current = mapInstance;
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (map.current && mapStyle) {
      map.current.setStyle(mapStyle);
    }
  }, [mapStyle]);

  return <div ref={mapContainer} style={style} />;
};
